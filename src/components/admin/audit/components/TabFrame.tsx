import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AlertOctagon, AlertTriangle, BarChart3, ChevronDown, Hourglass, ShieldQuestion } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { KpiCard } from "./KpiCard";
import { InfoTip } from "./InfoTip";
import { ActionList, type ActionItem } from "./ActionList";
import { useAuditDepartments, useAuditOverview, useFollowUpSignals } from "../hooks/useAuditData";
import { useAuditDepartment } from "../hooks/useAuditDepartment";
import { buildFollowUp, matchesActionFilter, sortActionItems, type ActionFilter } from "../lib/complianceView";
import type { ComplianceCategoryKey } from "../types";

type Preset = "critical" | "warnings" | "untreated" | "noResponse" | null;

interface Props {
  /** i18n key segment, e.g. "operations" → audit.frame.tabs.operations.* */
  tabKey: string;
  categories: ComplianceCategoryKey[];
  /** Registers/lists — always visible below "Requires action". */
  children: ReactNode;
  /** Charts/trends in the collapsible "Statistics and trends" (closed by default). Omitted → section hidden. */
  stats?: ReactNode;
}

/**
 * Shared presentation frame for each tab: KPI strip → "Requires action" → the tab's
 * registers (children) → optional collapsible "Statistics and trends" (stats). Uses the same findings
 * and follow-up signals as the overview, filtered by category only.
 */
export const TabFrame = ({ tabKey, categories, children, stats }: Props) => {
  const { t } = useTranslation();
  const { dept } = useAuditDepartment();
  const o = useAuditOverview(dept);
  const follow = useFollowUpSignals();
  const { data: departments = [] } = useAuditDepartments();
  const [filter, setFilter] = useState<ActionFilter>("all");
  const [preset, setPreset] = useState<Preset>(null);
  const [statsOpen, setStatsOpen] = useState(false);

  const deptName = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);
  const followState = useMemo(
    () => buildFollowUp(follow.data ?? { reminders: [], dispositions: [], registered: [] }),
    [follow.data],
  );
  const items: ActionItem[] = useMemo(
    () =>
      sortActionItems(
        o.scannerFindings
          .filter((f) => categories.includes(f.categoryKey))
          .map((f) => {
            const ctx = o.contextFor(f);
            return { finding: f, ctx, follow: followState(f), departmentName: ctx.companyId ? deptName.get(ctx.companyId) ?? null : null };
          }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [o.scannerFindings, followState, deptName, categories.join(",")],
  );

  const loading = o.isLoading || follow.isLoading;
  const critical = items.filter((i) => i.finding.severity === "critical").length;
  const warnings = items.filter((i) => i.finding.severity === "warning").length;
  const untreated = items.filter((i) => !i.follow.handled).length;
  const noResponse = items.filter((i) => i.follow.reminder === "noResponse").length;

  const listed = items.filter((i) => {
    switch (preset) {
      case "critical": return i.finding.severity === "critical";
      case "warnings": return i.finding.severity === "warning";
      case "untreated": return !i.follow.handled;
      case "noResponse": return i.follow.reminder === "noResponse";
      default: return matchesActionFilter(i.follow, filter);
    }
  });
  const toggle = (p: Preset) => setPreset((c) => (c === p ? null : p));

  return (
    <div className="space-y-6">
      {loading ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Card><CardContent className="p-4 space-y-3">
            <Skeleton className="h-5 w-48" />
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </CardContent></Card>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard icon={AlertOctagon} label={t("audit.frame.kpi.critical.label")} value={critical}
              tone={critical > 0 ? "danger" : "success"} active={preset === "critical"} onClick={() => toggle("critical")}
              info={<InfoTip k="audit.frame.kpi.critical" />} />
            <KpiCard icon={AlertTriangle} label={t("audit.frame.kpi.warnings.label")} value={warnings}
              tone={warnings > 0 ? "warning" : "success"} active={preset === "warnings"} onClick={() => toggle("warnings")}
              info={<InfoTip k="audit.frame.kpi.warnings" />} />
            <KpiCard icon={ShieldQuestion} label={t("audit.frame.kpi.untreated.label")} value={untreated}
              tone={untreated > 0 ? "warning" : "success"} active={preset === "untreated"} onClick={() => toggle("untreated")}
              info={<InfoTip k="audit.frame.kpi.untreated" />} />
            <KpiCard icon={Hourglass} label={t("audit.frame.kpi.noResponse.label")} value={noResponse}
              tone={noResponse > 0 ? "danger" : "success"} active={preset === "noResponse"} onClick={() => toggle("noResponse")}
              info={<InfoTip k="audit.frame.kpi.noResponse" />} />
          </div>
          <ActionList
            items={listed}
            filter={filter}
            onFilterChange={(f) => { setFilter(f); setPreset(null); }}
            presetLabel={preset ? t(`audit.frame.kpi.${preset}.label`) : null}
            onClearPreset={() => setPreset(null)}
            showDepartment={!dept && departments.length > 1}
            helpKey={`audit.frame.tabs.${tabKey}.help`}
            emptyKey={`audit.frame.tabs.${tabKey}.empty`}
          />
        </>
      )}

      {children}

      {stats && <Collapsible open={statsOpen} onOpenChange={setStatsOpen}>
        <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
          <CollapsibleTrigger className="flex flex-1 min-w-0 items-center gap-2 text-left text-base font-semibold">
            <BarChart3 className="h-4 w-4 shrink-0 text-primary" />
            <span className="flex-1 min-w-0 truncate">{t("audit.frame.stats")}</span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", statsOpen && "rotate-180")} />
          </CollapsibleTrigger>
          <InfoTip k={`audit.frame.tabs.${tabKey}.statsHelp`} />
        </div>
        <CollapsibleContent className="pt-4">{stats}</CollapsibleContent>
      </Collapsible>}
    </div>
  );
};
