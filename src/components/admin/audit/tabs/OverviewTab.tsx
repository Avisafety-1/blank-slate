import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Users,
  Plane,
  Activity,
  AlertTriangle,
  ListChecks,
  ClipboardCheck,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  FileWarning,
  UserX,
  Wrench,
  CalendarClock,
  Package,
  AlertOctagon,
} from "lucide-react";
import type { ComplianceCategoryKey } from "../types";
import type { AuditTabValue } from "../AuditSection";

// Which top-level Audit tab each score-ring category maps to.
const CATEGORY_TO_TAB: Record<ComplianceCategoryKey, AuditTabValue> = {
  competence: "competency",
  documentation: "documentation",
  fleet: "fleet",
  operations: "operations",
  safety: "safety",
};

interface OverviewTabProps {
  onNavigate: (tab: AuditTabValue) => void;
}

export const OverviewTab = ({ onNavigate }: OverviewTabProps) => {
  const { t } = useTranslation();
  const o = useAuditOverview();
  const [showActivity, setShowActivity] = useState(false);

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

  const k = o.kpis;
  const criticalOpen = k?.criticalFindings ?? 0;

  return (
    <div className="space-y-6">
      {/* --- Score + primary CTA row --- */}
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

        <div className="lg:col-span-3 flex flex-col gap-4">
          {/* Inspection package CTA */}
          <Card>
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/15 text-primary">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{t("audit.overview.inspectionCta.title")}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("audit.overview.inspectionCta.body")}
                  </div>
                  {criticalOpen > 0 && (
                    <div className="text-xs text-status-red mt-1 flex items-center gap-1">
                      <AlertOctagon className="w-3.5 h-3.5" />
                      {t("audit.overview.inspectionCta.criticalWarning", { count: criticalOpen })}
                    </div>
                  )}
                </div>
              </div>
              <Button size="lg" onClick={() => scrollToAuditTab("package")}>
                {t("audit.overview.inspectionCta.button")}
              </Button>
            </CardContent>
          </Card>

          {/* Action-oriented KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <KpiCard
              label={t("audit.actionKpi.documentsExpiring")}
              value={k?.documentsExpiring30d ?? 0}
              icon={FileWarning}
              tone={(k?.documentsExpiring30d ?? 0) > 0 ? "warning" : "success"}
              actionHint={
                (k?.documentsExpiring30d ?? 0) > 0
                  ? t("audit.actionKpi.documentsExpiringHint")
                  : t("audit.actionKpi.noActionNeeded")
              }
              onClick={() => scrollToAuditTab("documentation")}
            />
            <KpiCard
              label={t("audit.actionKpi.competencyExpiring")}
              value={k?.competenciesExpiring60d ?? 0}
              icon={UserX}
              tone={(k?.competenciesExpiring60d ?? 0) > 0 ? "warning" : "success"}
              actionHint={
                (k?.pilotsWithExpiringSoon ?? 0) > 0
                  ? t("audit.actionKpi.competencyExpiringHint", { pilots: k?.pilotsWithExpiringSoon ?? 0 })
                  : t("audit.actionKpi.noActionNeeded")
              }
              onClick={() => scrollToAuditTab("competency")}
            />
            <KpiCard
              label={t("audit.actionKpi.dronesOverdue")}
              value={k?.dronesOverdue ?? 0}
              icon={Wrench}
              tone={(k?.dronesOverdue ?? 0) > 0 ? "danger" : "success"}
              actionHint={
                (k?.dronesRequiringMaintenance ?? 0) > 0
                  ? t("audit.actionKpi.dronesRequiringHint", { count: k?.dronesRequiringMaintenance ?? 0 })
                  : t("audit.actionKpi.noActionNeeded")
              }
              onClick={() => scrollToAuditTab("fleet")}
            />
            <KpiCard
              label={t("audit.actionKpi.openFindings")}
              value={k?.openFindings ?? 0}
              icon={AlertTriangle}
              tone={(k?.criticalFindings ?? 0) > 0 ? "danger" : (k?.openFindings ?? 0) > 0 ? "warning" : "success"}
              actionHint={
                (k?.criticalFindings ?? 0) > 0
                  ? t("audit.actionKpi.criticalOpen", { count: k?.criticalFindings ?? 0 })
                  : t("audit.actionKpi.noActionNeeded")
              }
              onClick={() => scrollToAuditTab("internal")}
            />
            <KpiCard
              label={t("audit.actionKpi.overdueActions")}
              value={k?.openActions ?? 0}
              icon={ListChecks}
              tone={(k?.openActions ?? 0) > 0 ? "warning" : "success"}
              onClick={() => scrollToAuditTab("internal")}
            />
            <KpiCard
              label={t("audit.actionKpi.plannedReviews")}
              value={k?.plannedReviews ?? 0}
              icon={CalendarClock}
              tone="default"
              actionHint={
                (k?.plannedReviews ?? 0) > 0
                  ? t("audit.actionKpi.plannedReviewsHint")
                  : t("audit.actionKpi.plannedReviewsNone")
              }
              onClick={() => scrollToAuditTab("internal")}
            />
          </div>
        </div>
      </div>

      {/* --- Score per category --- */}
      <CategoryScoreGrid
        evaluation={o.evaluation}
        onSelect={(key) => scrollToAuditTab(CATEGORY_TO_TAB[key])}
      />

      {/* --- Grouped alerts --- */}
      <ComplianceAlertsPanel findings={o.scannerFindings} />

      {/* --- Optional: activity stats (collapsed by default) --- */}
      <Collapsible open={showActivity} onOpenChange={setShowActivity}>
        <Card>
          <CardHeader className="pb-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="justify-between px-0 hover:bg-transparent">
                <CardTitle className="text-sm text-muted-foreground font-medium">
                  {t("audit.overview.activityHeader")}
                </CardTitle>
                {showActivity ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label={t("audit.kpi.activePilots")} value={k?.activePilots ?? 0} icon={Users} />
                <KpiCard label={t("audit.kpi.activeDrones")} value={k?.activeDrones ?? 0} icon={Plane} />
                <KpiCard label={t("audit.kpi.flights12mo")} value={k?.flights12mo ?? 0} icon={Activity} />
                <KpiCard label={t("audit.kpi.incidents12mo")} value={k?.incidents12mo ?? 0} icon={AlertTriangle} tone="warning" />
                <KpiCard label={t("audit.kpi.internalAudits")} value={k?.internalAuditsDone ?? 0} icon={ClipboardCheck} />
                <KpiCard label={t("audit.kpi.riskAssessments")} value={k?.riskAssessments12mo ?? 0} icon={ClipboardList} />
                <KpiCard label={t("audit.kpi.completedChecklists")} value={k?.completedChecklists12mo ?? 0} icon={ListChecks} />
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {o.insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("audit.overview.aiInsights")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {o.insights.map((i) => (
              <div key={i.id} className="rounded-md border p-3">
                <div className="text-sm font-medium">{t(i.titleKey, i.params as any) as string}</div>
                <div className="text-xs text-muted-foreground">{t(i.bodyKey, i.params as any) as string}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">{t("audit.disclaimer")}</p>
    </div>
  );
};
