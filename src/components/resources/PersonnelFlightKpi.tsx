import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Pencil, Plane } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

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

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}t`;
  return `${h}t ${m}m`;
}

function bucketize(logs: FlightLog[], days: number): { label: string; minutes: number }[] {
  // ~12 buckets across the period
  const buckets = Math.min(12, Math.max(6, Math.ceil(days / 7)));
  const bucketDays = days / buckets;
  const now = Date.now();
  const start = now - days * 24 * 60 * 60 * 1000;
  const data: { label: string; minutes: number }[] = Array.from({ length: buckets }, (_, i) => ({
    label: String(i),
    minutes: 0,
  }));
  for (const log of logs) {
    const t = new Date(log.flight_date).getTime();
    if (isNaN(t) || t < start) continue;
    const idx = Math.min(buckets - 1, Math.floor((t - start) / (bucketDays * 24 * 60 * 60 * 1000)));
    data[idx].minutes += log.flight_duration_minutes || 0;
  }
  return data;
}

export function PersonnelFlightKpi({ personId }: Props) {
  const [periods, setPeriods] = useState<[number, number, number]>(loadPeriods);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<[number, number, number]>(periods);
  const [logs, setLogs] = useState<FlightLog[]>([]);
  const [loading, setLoading] = useState(true);

  const maxDays = Math.max(...periods);

  useEffect(() => {
    let cancelled = false;
    const fetchLogs = async () => {
      setLoading(true);
      const cutoff = new Date(Date.now() - maxDays * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const { data, error } = await (supabase as any)
        .from("flight_logs")
        .select("flight_date, flight_duration_minutes")
        .eq("user_id", personId)
        .gte("flight_date", cutoff);
      if (cancelled) return;
      if (error) {
        console.error("Failed to fetch flight logs for KPI", error);
        setLogs([]);
      } else {
        setLogs((data as FlightLog[]) || []);
      }
      setLoading(false);
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
    setPeriods(draft);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {}
    setEditOpen(false);
  };

  return (
    <div className="border rounded-lg p-3 bg-card space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5 text-muted-foreground">
          <Plane className="h-3.5 w-3.5" />
          Flytid
        </h3>
        <Popover open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (o) setDraft(periods); }}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="end">
            <div className="space-y-3">
              <p className="text-xs font-medium">Tilpass perioder (dager)</p>
              {draft.map((value, i) => (
                <div key={i}>
                  <Label className="text-xs">Periode {i + 1}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={3650}
                    value={value}
                    onChange={(e) => {
                      const v = Math.max(1, Number(e.target.value) || 1);
                      setDraft((prev) => {
                        const next = [...prev] as [number, number, number];
                        next[i] = v;
                        return next;
                      });
                    }}
                    className="h-8"
                  />
                </div>
              ))}
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditOpen(false)}>Avbryt</Button>
                <Button size="sm" onClick={savePeriods}>Lagre</Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {stats.map((s, i) => (
          <div key={i} className="rounded-md border border-border/60 bg-muted/20 p-2 min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Siste {s.days}d
            </p>
            <p className="text-base sm:text-lg font-bold leading-tight">
              {loading ? "…" : formatHours(s.total)}
            </p>
            <div className="h-10 mt-1">
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
                    formatter={(v: number) => [formatHours(v), "Flytid"]}
                    labelFormatter={() => ""}
                  />
                  <Bar dataKey="minutes" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
