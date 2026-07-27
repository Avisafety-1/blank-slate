import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, ShieldAlert, ListChecks, CheckCircle2, Clock, AlertOctagon } from "lucide-react";
import { KpiCard } from "../components/KpiCard";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { useAuditSafety } from "../hooks/useAuditData";

const SEV_TINT: Record<string, string> = {
  kritisk: "bg-status-red/70 text-black border-status-red/60",
  critical: "bg-status-red/70 text-black border-status-red/60",
  hoy: "bg-status-red/50 text-black border-status-red/40",
  moderat: "bg-status-yellow/70 text-black border-status-yellow/60",
  lav: "bg-status-green/60 text-black border-status-green/50",
  ukjent: "bg-muted text-foreground",
};

function severityLabel(t: (k: string) => string, sev: string): string {
  const key = sev.toLowerCase();
  const map: Record<string, string> = {
    kritisk: "audit.safety.severity.kritisk",
    critical: "audit.safety.severity.kritisk",
    hoy: "audit.safety.severity.hoy",
    høy: "audit.safety.severity.hoy",
    moderat: "audit.safety.severity.moderat",
    lav: "audit.safety.severity.lav",
    low: "audit.safety.severity.lav",
    medium: "audit.safety.severity.moderat",
    high: "audit.safety.severity.hoy",
    ukjent: "audit.safety.severity.ukjent",
  };
  return t(map[key] ?? "audit.safety.severity.ukjent");
}

export const SafetyTab = () => {
  const { t } = useTranslation();
  const { data, isLoading, isError, error } = useAuditSafety();

  if (isLoading) return <Skeleton className="h-40" />;
  if (isError) return <p className="text-sm text-status-red">{t("audit.states.error")}: {error?.message}</p>;
  if (!data) return null;

  const totalSev = data.bySeverity.reduce((s, b) => s + b.count, 0) || 1;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard label={t("audit.safety.reported")} value={data.reported} icon={AlertTriangle} tone="warning" />
        <KpiCard label={t("audit.safety.criticalIncidents")} value={data.critical} icon={AlertOctagon} tone={data.critical > 0 ? "danger" : "success"} />
        <KpiCard label={t("audit.safety.openIncidents")} value={data.openIncidents} icon={ShieldAlert} tone={data.openIncidents > 0 ? "warning" : "success"} />
        <KpiCard label={t("audit.safety.openActions")} value={data.openActions} icon={ListChecks} tone={data.openActions > 0 ? "warning" : "success"} />
        <KpiCard label={t("audit.safety.closedOnTime")} value={data.closedOnTimePct === null ? "—" : `${data.closedOnTimePct}%`} icon={CheckCircle2} tone={data.closedOnTimePct !== null && data.closedOnTimePct >= 80 ? "success" : "warning"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("audit.safety.bySeverity")}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.bySeverity.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("audit.safety.noBreakdown")}</p>
            ) : (
              <ul className="space-y-3">
                {data.bySeverity.map((b) => (
                  <li key={b.severity} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`uppercase text-xs ${SEV_TINT[b.severity.toLowerCase()] ?? SEV_TINT.ukjent}`}>
                        {severityLabel(t, b.severity)}
                      </Badge>
                      <span className="ml-auto text-sm tabular-nums">{b.count}</span>
                    </div>
                    <Progress value={(b.count / totalSev) * 100} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("audit.safety.byCategory")}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.byCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("audit.safety.noBreakdown")}</p>
            ) : (
              <ul className="space-y-2">
                {data.byCategory.map((c) => (
                  <li key={c.category} className="flex items-center gap-2 text-sm">
                    <span className="truncate flex-1">{c.category}</span>
                    <Badge variant="outline">{c.count}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" /> {t("audit.safety.trend")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis allowDecimals={false} className="text-xs" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="incidents" name={t("audit.safety.reported")} stroke="hsl(var(--status-yellow))" strokeWidth={2} />
                <Line type="monotone" dataKey="nearMiss" name={t("audit.safety.criticalIncidents")} stroke="hsl(var(--status-red))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
