import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Plane, Activity, AlertTriangle, ListChecks, ClipboardCheck, ShieldCheck, ClipboardList } from "lucide-react";
import { KpiCard } from "../components/KpiCard";
import { ComplianceScoreRing } from "../components/ComplianceScoreRing";
import { ComplianceAlertsPanel } from "../components/ComplianceAlertsPanel";
import { useAuditOverview } from "../hooks/useAuditData";

export const OverviewTab = () => {
  const { t } = useTranslation();
  const o = useAuditOverview();

  if (o.isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }
  if (o.isError) {
    return <p className="text-sm text-status-red">{t("audit.states.error")}: {o.error?.message}</p>;
  }

  const score = o.evaluation?.overall ?? 0;
  const dq = o.evaluation?.dataQuality;
  const coveragePct = dq && (dq.covered + dq.unknown) > 0
    ? Math.round((dq.covered / (dq.covered + dq.unknown)) * 100)
    : 0;
  const computedAt = o.evaluation ? new Date(o.evaluation.computedAt).toLocaleString() : "—";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="lg:col-span-1">
          <CardContent className="p-6 flex flex-col items-center gap-3">
            <ComplianceScoreRing score={score} label={t("audit.overview.compliance")} />
            <div className="w-full space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t("audit.overview.dataQuality")}</span>
                <span>{coveragePct}%</span>
              </div>
              <Progress value={coveragePct} />
            </div>
            <p className="text-[11px] text-muted-foreground text-center">
              {t("audit.overview.lastComputed")}: {computedAt}
            </p>
          </CardContent>
        </Card>
        <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label={t("audit.kpi.activePilots")} value={o.kpis?.activePilots ?? 0} icon={Users} />
          <KpiCard label={t("audit.kpi.activeDrones")} value={o.kpis?.activeDrones ?? 0} icon={Plane} />
          <KpiCard label={t("audit.kpi.flights12mo")} value={o.kpis?.flights12mo ?? 0} icon={Activity} />
          <KpiCard label={t("audit.kpi.incidents12mo")} value={o.kpis?.incidents12mo ?? 0} icon={AlertTriangle} tone="warning" />
          <KpiCard label={t("audit.kpi.openActions")} value={o.kpis?.openActions ?? 0} icon={ListChecks} tone="warning" />
          <KpiCard label={t("audit.kpi.internalAudits")} value={o.kpis?.internalAuditsDone ?? 0} icon={ClipboardCheck} />
          <KpiCard label={t("audit.kpi.riskAssessments")} value={o.kpis?.riskAssessments12mo ?? 0} icon={ClipboardList} />
          <KpiCard label={t("audit.kpi.completedChecklists")} value={o.kpis?.completedChecklists12mo ?? 0} icon={ShieldCheck} />
        </div>
      </div>

      <ComplianceAlertsPanel findings={o.scannerFindings} />

      {o.insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI insights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {o.insights.map((i) => (
              <div key={i.id} className="rounded-md border p-3">
                <div className="text-sm font-medium">{t(i.titleKey, i.params as any)}</div>
                <div className="text-xs text-muted-foreground">{t(i.bodyKey, i.params as any)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">{t("audit.disclaimer")}</p>
    </div>
  );
};
