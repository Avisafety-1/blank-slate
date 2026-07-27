import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldAlert, ListChecks, CheckCircle2, Clock } from "lucide-react";
import { KpiCard } from "../components/KpiCard";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { useAuditOverview, useAuditSafety } from "../hooks/useAuditData";
import { cn } from "@/lib/utils";

const SEV_TINT: Record<string, string> = {
  critical: "bg-status-red/70 text-black border-status-red/60",
  warning: "bg-status-yellow/70 text-black border-status-yellow/60",
  info: "bg-primary/70 text-black border-primary/60",
};

export const SafetyTab = () => {
  const { t } = useTranslation();
  const { data, isLoading, isError, error } = useAuditSafety();
  const overview = useAuditOverview();

  const topFindings = useMemo(() => {
    const map = new Map<string, { code: string; count: number; severity: string; titleKey: string }>();
    for (const f of overview.scannerFindings) {
      const cur = map.get(f.code);
      if (cur) cur.count++;
      else map.set(f.code, { code: f.code, count: 1, severity: f.severity, titleKey: f.titleKey });
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 8);
  }, [overview.scannerFindings]);

  if (isLoading) return <Skeleton className="h-40" />;
  if (isError) return <p className="text-sm text-status-red">{t("audit.states.error")}: {error?.message}</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard label={t("audit.safety.reported")} value={data.reported} icon={AlertTriangle} tone="warning" />
        <KpiCard label={t("audit.safety.nearMiss")} value={data.nearMiss} icon={ShieldAlert} tone="warning" />
        <KpiCard label={t("audit.safety.openActions")} value={data.openActions} icon={ListChecks} />
        <KpiCard label={t("audit.safety.closedActions")} value={data.closedActions} icon={CheckCircle2} tone="success" />
        <KpiCard label={t("audit.safety.avgCloseDays")} value={data.avgCloseDays ?? "—"} icon={Clock} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("audit.safety.topFindings")}</CardTitle>
        </CardHeader>
        <CardContent>
          {topFindings.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("audit.safety.topFindingsEmpty")}</p>
          ) : (
            <ul className="space-y-2">
              {topFindings.map((f) => (
                <li key={f.code} className="flex items-center gap-3">
                  <Badge variant="outline" className={cn("uppercase text-xs px-2 py-0.5", SEV_TINT[f.severity] ?? "")}>
                    {t(`audit.severity.${f.severity}`)}
                  </Badge>
                  <div className="flex-1 min-w-0 text-sm truncate">
                    {String(t(f.titleKey, { count: f.count } as never))}
                  </div>
                  <Badge variant="outline" className="text-xs">{f.count}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("audit.safety.trend")}</CardTitle>
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
                <Line type="monotone" dataKey="incidents" name={t("audit.safety.reported")} stroke="hsl(var(--status-red))" strokeWidth={2} />
                <Line type="monotone" dataKey="nearMiss" name={t("audit.safety.nearMiss")} stroke="hsl(var(--status-yellow))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
