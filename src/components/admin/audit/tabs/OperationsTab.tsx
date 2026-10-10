import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertOctagon, AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck, Clock, PlaneTakeoff, ShieldCheck } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useAuditOperations } from "../hooks/useAuditData";
import { auditDeepLink } from "../utils/auditDeepLink";
import type { OperationsIssue } from "../types";
import { cn } from "@/lib/utils";
import { InfoTip } from "../components/InfoTip";
import { MissingFlightLogsSection } from "../components/MissingFlightLogsSection";

const ISSUE_ORDER: OperationsIssue["code"][] = [
  "activeFlightStale",
  "missionInProgressStale",
  "flownWithNoGo",
  "soraEnvelopeExceeded",
  "missionPlannedPastDue",
  "missingRiskAssessment",
];

const SAIL_LEVELS = ["I", "II", "III", "IV", "V", "VI"];

export const OperationsTab = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const settings = useCompanySettings();
  const requireSora = !!(settings as any)?.require_sora_on_missions;
  const { data, isLoading, isError, error } = useAuditOperations();

  const grouped = useMemo(() => {
    const g = new Map<OperationsIssue["code"], OperationsIssue[]>();
    for (const i of data?.issues ?? []) {
      if (i.code === "missingRiskAssessment" && !requireSora) continue;
      if (i.code === "missionWithoutFlightLog") continue; // own section
      g.set(i.code, [...(g.get(i.code) ?? []), i]);
    }
    return g;
  }, [data, requireSora]);

  const monthLabel = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(i18n.language, { month: "short", year: "2-digit" });
  };

  if (isLoading) return <Skeleton className="h-40" />;
  if (isError || !data) return <p className="text-sm text-status-red">{t("audit.states.error")}: {error?.message}</p>;

  const visibleIssues = [...grouped.values()].flat();
  const missingLogs = data.issues.filter((i) => i.code === "missionWithoutFlightLog");
  const critical = visibleIssues.filter((i) => i.severity === "critical").length;
  const hanging = (grouped.get("missionInProgressStale")?.length ?? 0) + (grouped.get("missionPlannedPastDue")?.length ?? 0) + (grouped.get("activeFlightStale")?.length ?? 0);
  const u = data.unplanned;
  const unplannedPct = Math.round(u.pct);
  const codes = ISSUE_ORDER.filter((c) => (grouped.get(c)?.length ?? 0) > 0);

  const unplannedChart = u.byMonth.map((m) => ({ ...m, label: monthLabel(m.month) }));
  const riskChart = data.risk.byMonth.map((m) => ({ ...m, label: monthLabel(m.month) }));
  const sailChart = SAIL_LEVELS.map((s) => ({ sail: s, value: data.sora.bySail[s] ?? 0 }));
  const riskColors: Record<string, string> = {
    go: "hsl(var(--status-green))",
    caution: "hsl(var(--status-yellow))",
    "no-go": "hsl(var(--status-red))",
    "not-assessed": "hsl(var(--muted-foreground))",
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={ClipboardCheck} label={t("audit.operations.summary.evaluated")} value={data.total} tone="neutral" />
        <KpiCard icon={AlertOctagon} label={t("audit.operations.summary.critical")} value={critical} tone={critical > 0 ? "red" : "green"} />
        <KpiCard icon={Clock} label={t("audit.operations.summary.hanging")} value={hanging} tone={hanging > 0 ? "yellow" : "green"} />
        <KpiCard
          icon={PlaneTakeoff}
          label={t("audit.operations.summary.unplannedShort")}
          value={u.total > 0 ? `${unplannedPct}%` : "—"}
          tone={u.total === 0 ? "neutral" : unplannedPct > 10 ? "yellow" : "green"}
        />
      </div>

      {/* Unplanned flights */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium flex-1 min-w-0">
              {t("audit.operations.unplanned.kpi", { count: u.unplanned, total: u.total, pct: unplannedPct })}
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/oppdrag?tab=logs&unplanned=1")}>
              {t("audit.operations.unplanned.open")} <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </div>
          {u.total > 0 && (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={unplannedChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="planned" stackId="a" name={t("audit.operations.unplanned.planned")} fill="hsl(var(--status-green))" />
                  <Bar dataKey="unplanned" stackId="a" name={t("audit.operations.unplanned.unplanned")} fill="hsl(var(--status-yellow))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* SORA profile vs system */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="text-sm font-medium">{t("audit.operations.sora.title")} <InfoTip k="audit.sectionHelp.sora" /></div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label={t("audit.operations.sora.assessed")} value={data.sora.assessed} />
              <Stat label={t("audit.operations.sora.within")} value={data.sora.within} cls="text-status-green" />
              <Stat label={t("audit.operations.sora.deviating")} value={data.sora.deviating} cls={data.sora.deviating > 0 ? "text-status-red" : ""} />
            </div>
            <div className="text-xs text-muted-foreground">{t("audit.operations.sora.bySail")}</div>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sailChart}>
                  <XAxis dataKey="sail" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                  <Tooltip />
                  <Bar dataKey="value" name={t("audit.operations.sora.missions")} fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Risk level on flown missions */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="text-sm font-medium">{t("audit.operations.risk.title")} <InfoTip k="audit.sectionHelp.risk" /></div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {data.risk.distribution.map((d) => (
                <Stat key={d.key} label={t(`audit.operations.risk.${d.key}`)} value={d.value} color={riskColors[d.key]} />
              ))}
            </div>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskChart}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                  <Tooltip />
                  <Bar dataKey="go" stackId="r" name={t("audit.operations.risk.go")} fill={riskColors.go} />
                  <Bar dataKey="caution" stackId="r" name={t("audit.operations.risk.caution")} fill={riskColors.caution} />
                  <Bar dataKey="noGo" stackId="r" name={t("audit.operations.risk.no-go")} fill={riskColors["no-go"]} />
                  <Bar dataKey="notAssessed" stackId="r" name={t("audit.operations.risk.not-assessed")} fill={riskColors["not-assessed"]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {data.approvedNoGo.length > 0 && (
        <Card className="border-l-4 border-l-status-green/60">
          <CardContent className="p-4 space-y-2">
            <div className="text-sm font-medium flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-status-green" />
              {t("audit.operations.approvedNoGo.title")}
              <InfoTip k="audit.sectionHelp.approvedNoGo" />
              <Badge variant="outline">{data.approvedNoGo.length}</Badge>
            </div>
            <ul className="divide-y divide-border">
              {data.approvedNoGo.map((m) => (
                <li key={m.missionId} className="flex items-start gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{m.missionTitle}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.missionDate ? new Date(m.missionDate).toLocaleDateString(i18n.language) : "—"}
                      {" · "}
                      {t("audit.operations.approvedNoGo.approvedBy", {
                        name: m.approvedBy ?? "—",
                        date: m.approvedAt ? new Date(m.approvedAt).toLocaleString(i18n.language) : "—",
                      })}
                    </div>
                    {m.approvalComment && <div className="text-xs mt-0.5 italic">«{m.approvalComment}»</div>}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => navigate(auditDeepLink("mission", m.missionId).path)}>
                    {t("audit.alerts.open")} <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <MissingFlightLogsSection issues={missingLogs} />

      {visibleIssues.length === 0 ? (
        <Card>
          <CardContent className="p-6 flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="w-8 h-8 text-status-green" />
            {t("audit.operations.noIssues")}
          </CardContent>
        </Card>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {codes.map((code) => {
            const items = grouped.get(code) ?? [];
            const isCritical = items.some((i) => i.severity === "critical");
            const Icon = isCritical ? AlertOctagon : AlertTriangle;
            return (
              <AccordionItem
                key={code}
                value={code}
                className={cn("border rounded-lg border-l-4 px-3", isCritical ? "border-l-status-red/60" : "border-l-status-yellow/60")}
              >
                <AccordionTrigger className="hover:no-underline py-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Icon className={cn("w-4 h-4 shrink-0", isCritical ? "text-status-red" : "text-status-yellow")} />
                    <span className="text-sm font-medium truncate">{t(`audit.operations.codes.${code}`)}</span>
                    <Badge variant="outline" className="ml-auto mr-2">{items.length}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-2">
                  <ul className="divide-y divide-border">
                    {items.map((i) => (
                      <li key={i.id} className="flex items-center gap-2 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{i.missionTitle}</div>
                          <div className="text-xs text-muted-foreground">
                            {i.missionDate ? new Date(i.missionDate).toLocaleDateString(i18n.language) : "—"}
                            {i.code === "missionInProgressStale" || i.code === "missionPlannedPastDue"
                              ? ` · ${t("audit.operations.daysOverdue", { count: i.days ?? 0 })}`
                              : null}
                            {i.code === "activeFlightStale" ? ` · ${t("audit.operations.hoursActive", { count: i.hours ?? 0 })}` : null}
                            {i.code === "soraEnvelopeExceeded" ? ` · ${t("audit.operations.systemSail", { sail: i.sail ?? "—" })}` : null}
                          </div>
                          {i.approvedBefore && (
                            <div className="mt-1 text-xs text-status-yellow">
                              {t("audit.operations.approvedBeforeNoGo", {
                                name: i.approvedBefore.by ?? "—",
                                date: i.approvedBefore.at ? new Date(i.approvedBefore.at).toLocaleString(i18n.language) : "—",
                              })}
                            </div>
                          )}
                          {i.details && i.details.length > 0 && (
                            <ul className="mt-1 text-xs text-status-yellow list-disc pl-4">
                              {i.details.map((d, k) => <li key={k}>{d}</li>)}
                            </ul>
                          )}
                        </div>
                        {i.missionId && (
                          <Button size="sm" variant="outline" onClick={() => navigate(auditDeepLink("mission", i.missionId!).path)}>
                            {t("audit.alerts.open")} <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
      <p className="text-xs text-muted-foreground text-right">
        {t("audit.operations.evaluatedFootnote", { total: data.total, issues: visibleIssues.length })}
      </p>
    </div>
  );
};

function Stat({ label, value, cls, color }: { label: string; value: number; cls?: string; color?: string }) {
  return (
    <div className="min-w-0">
      <div className={cn("text-lg font-semibold", cls)} style={color ? { color } : undefined}>{value}</div>
      <div className="text-[11px] text-muted-foreground truncate">{label}</div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof AlertOctagon;
  label: string;
  value: string | number;
  tone: "neutral" | "green" | "yellow" | "red";
}) {
  const toneCls = {
    neutral: "text-foreground",
    green: "text-status-green",
    yellow: "text-status-yellow",
    red: "text-status-red",
  }[tone];
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <Icon className={cn("w-5 h-5 shrink-0", toneCls)} />
        <div className="min-w-0">
          <div className={cn("text-xl font-semibold leading-tight", toneCls)}>{value}</div>
          <div className="text-xs text-muted-foreground truncate">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
