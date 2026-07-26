import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, ShieldAlert, ListChecks, CheckCircle2, Clock } from "lucide-react";
import { KpiCard } from "../components/KpiCard";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { useAuditSafety } from "../hooks/useAuditData";

export const SafetyTab = () => {
  const { t } = useTranslation();
  const { data, isLoading, isError, error } = useAuditSafety();
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
