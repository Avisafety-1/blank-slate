import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Pencil, Plane } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { cn } from "@/lib/utils";

interface Props {
  personId: string;
}

interface FlightLog {
  flight_date: string;
  flight_duration_minutes: number | null;
}

const STORAGE_KEY = "personnel-kpi-periods";
const DEFAULTS: [number, number, number] = [30, 90, 180];

function loadPeriods(): [number, number, number] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length === 3 && arr.every((n) => typeof n === "number" && n > 0)) {
      return arr as [number, number, number];
    }
  } catch {}
  return DEFAULTS;
}

function formatHours(minutes: number, hLabel: string, mLabel: string): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}${mLabel}`;
  if (m === 0) return `${h}${hLabel}`;
  return `${h}${hLabel} ${m}${mLabel}`;
}

function formatShortDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function bucketize(
  logs: FlightLog[],
  days: number,
): { label: string; minutes: number; bucketDays: number }[] {
  const buckets = Math.min(12, Math.max(6, Math.ceil(days / 7)));
  const bucketDays = days / buckets;
  const now = Date.now();
  const start = now - days * 24 * 60 * 60 * 1000;
  const msPerBucket = bucketDays * 24 * 60 * 60 * 1000;
  const data = Array.from({ length: buckets }, (_, i) => {
    const bStart = new Date(start + i * msPerBucket);
    const bEnd = new Date(start + (i + 1) * msPerBucket - 1);
    return {
      label: `${formatShortDate(bStart)}–${formatShortDate(bEnd)}`,
      minutes: 0,
      bucketDays,
    };
  });
  for (const log of logs) {
    const t = new Date(log.flight_date).getTime();
    if (isNaN(t) || t < start) continue;
    const idx = Math.min(buckets - 1, Math.floor((t - start) / msPerBucket));
    data[idx].minutes += log.flight_duration_minutes || 0;
  }
  return data;
}

export function PersonnelFlightKpi({ personId }: Props) {
  const { t } = useTranslation();
  const hLabel = t('resourceDialogs.personnelFlightKpi.hourShort');
  const mLabel = t('resourceDialogs.personnelFlightKpi.minuteShort');
  const company = useCompanySettings();
  const [userPeriods, setUserPeriods] = useState<[number, number, number]>(loadPeriods);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(userPeriods.map(String));
  const [logs, setLogs] = useState<FlightLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Active currency rules (rule 1 & 2)
  const activeRules = useMemo(() => {
    const rules: { hours: number; days: number }[] = [];
    if (company.currency_requirement_enabled && company.currency_requirement_hours > 0 && company.currency_requirement_days > 0) {
      rules.push({ hours: company.currency_requirement_hours, days: company.currency_requirement_days });
    }
    if (company.currency_requirement_2_enabled && company.currency_requirement_2_hours > 0 && company.currency_requirement_2_days > 0) {
      rules.push({ hours: company.currency_requirement_2_hours, days: company.currency_requirement_2_days });
    }
    return rules;
  }, [company]);

  // Show required periods first so the pilot card always surfaces them.
  const periods = useMemo<[number, number, number]>(() => {
    if (activeRules.length === 0) return userPeriods;
    const required = Array.from(new Set(activeRules.map((r) => r.days)));
    const rest = userPeriods.filter((d) => !required.includes(d));
    const combined = [...required, ...rest];
    while (combined.length < 3) combined.push(rest.shift() ?? 180);
    return [combined[0], combined[1], combined[2]] as [number, number, number];
  }, [activeRules, userPeriods]);

  const maxDays = Math.max(...periods);

  useEffect(() => {
    let cancelled = false;
    const fetchLogs = async () => {
      setLoading(true);
      const cutoff = new Date(Date.now() - maxDays * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      try {
        // Same source of truth as the logbook: flights linked to the pilot
        // via flight_log_personnel, plus flights the person owns directly.
        const { data: personnelRows, error: flpErr } = await (supabase as any)
          .from("flight_log_personnel")
          .select("flight_log_id")
          .eq("profile_id", personId);
        if (flpErr) throw flpErr;

        const logIds = (personnelRows || []).map((r: any) => r.flight_log_id).filter(Boolean);

        const queries: Promise<any>[] = [
          (supabase as any)
            .from("flight_logs")
            .select("id, flight_date, flight_duration_minutes")
            .eq("user_id", personId)
            .gte("flight_date", cutoff),
        ];
        if (logIds.length > 0) {
          queries.push(
            (supabase as any)
              .from("flight_logs")
              .select("id, flight_date, flight_duration_minutes")
              .in("id", logIds)
              .gte("flight_date", cutoff),
          );
        }

        const results = await Promise.all(queries);
        if (cancelled) return;

        const byId = new Map<string, FlightLog>();
        for (const res of results) {
          if (res.error) throw res.error;
          for (const row of res.data || []) byId.set(row.id, row as FlightLog);
        }
        setLogs(Array.from(byId.values()));
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to fetch flight logs for KPI", error);
        setLogs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchLogs();
    return () => {
      cancelled = true;
    };
  }, [personId, maxDays]);


  const stats = useMemo(() => {
    return periods.map((days) => {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      const filtered = logs.filter((l) => new Date(l.flight_date).getTime() >= cutoff);
      const total = filtered.reduce((sum, l) => sum + (l.flight_duration_minutes || 0), 0);
      return { days, total, buckets: bucketize(filtered, days) };
    });
  }, [logs, periods]);

  const savePeriods = () => {
    const parsed = draft.map((s) => {
      const n = Number(s);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    });
    const next: [number, number, number] = [
      parsed[0] ?? userPeriods[0],
      parsed[1] ?? userPeriods[1],
      parsed[2] ?? userPeriods[2],
    ];
    setUserPeriods(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
    setEditOpen(false);
  };

  // Per-period status colour based on the matching active rule, if any.
  const statusColorForDays = (days: number, minutes: number): string => {
    const rule = activeRules.find((r) => r.days === days);
    if (!rule) return "";
    const required = rule.hours * 60;
    if (minutes < required) return "text-status-red";
    if (minutes < required * 1.2) return "text-status-yellow";
    return "text-status-green";
  };

  const requirementLabel = activeRules
    .map((r) => t('resourceDialogs.personnelFlightKpi.requirementLabel', { hours: r.hours, days: r.days }))
    .join(" · ");

  return (
    <div className="border rounded-lg p-3 bg-card space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5 text-muted-foreground">
          <Plane className="h-3.5 w-3.5" />
          {t('resourceDialogs.personnelFlightKpi.flightTime')}
          {activeRules.length > 0 && (
            <span className="text-[10px] font-normal text-muted-foreground/80">
              · {t('resourceDialogs.personnelFlightKpi.requirement')} {requirementLabel}
            </span>
          )}
        </h3>
        <Popover open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (o) setDraft(periods.map(String)); }}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="end">
            <div className="space-y-3">
              <p className="text-xs font-medium">{t('resourceDialogs.personnelFlightKpi.customizePeriods')}</p>
              {draft.map((value, i) => {
                const locked = i < activeRules.length;
                return (
                  <div key={i}>
                    <Label className="text-xs">
                      {t('resourceDialogs.personnelFlightKpi.period', { n: i + 1 })}
                      {locked && <span className="ml-1 text-muted-foreground">{t('resourceDialogs.personnelFlightKpi.lockedByCompany')}</span>}
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={3650}
                      value={value}
                      disabled={locked}
                      onChange={(e) => {
                        setDraft((prev) => {
                          const next = [...prev];
                          next[i] = e.target.value;
                          return next;
                        });
                      }}
                      className="h-8"
                    />
                  </div>
                );
              })}
              {activeRules.length > 0 && (
                <p className="text-[10px] text-muted-foreground leading-tight">
                  {t('resourceDialogs.personnelFlightKpi.companyRequires', { req: requirementLabel })}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditOpen(false)}>{t('resourceDialogs.personnelFlightKpi.cancel')}</Button>
                <Button size="sm" onClick={savePeriods}>{t('resourceDialogs.personnelFlightKpi.save')}</Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {stats.map((s, i) => {
          const colorClass = statusColorForDays(s.days, s.total);
          const bucketDays = s.buckets[0]?.bucketDays ?? s.days / 6;
          const bucketLabel =
            Math.round(bucketDays) === 7
              ? t('resourceDialogs.personnelFlightKpi.flightTimePerWeek')
              : t('resourceDialogs.personnelFlightKpi.flightTimePerDays', { n: Math.round(bucketDays) });
          return (
            <div key={i} className="rounded-md border border-border/60 bg-muted/20 p-2 min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t('resourceDialogs.personnelFlightKpi.lastDays', { n: s.days })}
              </p>
              <p className={cn("text-base sm:text-lg font-bold leading-tight", colorClass)}>
                {loading ? "…" : formatHours(s.total, hLabel, mLabel)}
              </p>
              <div
                className="h-10 mt-1"
                aria-label={t('resourceDialogs.personnelFlightKpi.bucketAria', { label: bucketLabel, n: s.days })}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={s.buckets}>
                    <XAxis dataKey="label" hide />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted))" }}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 6,
                        fontSize: 11,
                        padding: "4px 6px",
                      }}
                      formatter={(v: number) => [formatHours(v, hLabel, mLabel), t('resourceDialogs.personnelFlightKpi.flightTime')]}
                      labelFormatter={(label) => String(label)}
                    />
                    <Bar dataKey="minutes" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[9px] text-muted-foreground/70 leading-none mt-0.5 text-center">
                {bucketLabel}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
