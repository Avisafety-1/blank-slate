import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertOctagon, AlertTriangle, CalendarClock, Hourglass } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KpiCard } from "../components/KpiCard";
import { ComplianceScoreRing } from "../components/ComplianceScoreRing";
import { InfoTip } from "../components/InfoTip";
import { ActionList, type ActionItem } from "../components/ActionList";
import { useAuditDepartments, useAuditFleet, useAuditOperations, useAuditOverview, useAuditReviews, useFollowUpSignals } from "../hooks/useAuditData";
import { airworthyFleet, flightLogCoverage, formatShare, auditProgramme, type MetricTone } from "../lib/overviewMetrics";
import { useAuditDepartment } from "../hooks/useAuditDepartment";
import {
  buildFollowUp, followUpRate, matchesActionFilter, sortActionItems, type ActionFilter,
} from "../lib/complianceView";
import type { ComplianceCategoryKey } from "../types";
import type { AuditTabValue } from "../AuditSection";
import { cn } from "@/lib/utils";

type Preset = "untreatedCritical" | "noResponse" | "warnings" | "overdue" | null;

const CATEGORIES: ComplianceCategoryKey[] = ["competence", "documentation", "fleet", "operations", "safety"];

interface OverviewTabProps {
  onNavigate: (tab: AuditTabValue, opts?: { auditId?: string }) => void;
}

export const OverviewTab = ({ onNavigate }: OverviewTabProps) => {
  const { t } = useTranslation();
  const { dept, setDept } = useAuditDepartment();
  const o = useAuditOverview(dept);
  const follow = useFollowUpSignals();
  const { data: departments = [] } = useAuditDepartments();
  const [filter, setFilter] = useState<ActionFilter>("all");
  const [preset, setPreset] = useState<Preset>(null);
  const [explainOpen, setExplainOpen] = useState(false);

  const deptName = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);
  const followState = useMemo(
    () => buildFollowUp(follow.data ?? { reminders: [], dispositions: [], registered: [] }),
    [follow.data],
  );

  const items: ActionItem[] = useMemo(
    () =>
      sortActionItems(
        o.scannerFindings.map((f) => {
          const ctx = o.contextFor(f);
          return { finding: f, ctx, follow: followState(f), departmentName: ctx.companyId ? deptName.get(ctx.companyId) ?? null : null };
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [o.scannerFindings, followState, deptName],
  );

  if (o.isLoading || follow.isLoading) return <OverviewSkeleton />;
  if (o.isError) return <p className="text-sm text-status-red">{t("audit.states.error")}: {o.error?.message}</p>;

  // Accepted/snoozed findings are hidden from the list but still count as followed up.
  const dismissed = new Set(
    o.dispositions.filter((d: any) => d.disposition === "dismissed").map((d: any) => `${d.finding_code}:${d.entity_type}:${d.entity_id}`),
  );
  const followUpBase = o.undisposedFindings.filter((f) => !dismissed.has(`${f.code}:${f.entityType}:${f.entityId}`));
  const followRate = followUpRate(followUpBase, followState);
  const score = o.evaluation?.overall ?? null;

  const untreatedCritical = items.filter((i) => i.finding.severity === "critical" && !i.follow.handled).length;
  const noResponse = items.filter((i) => i.follow.reminder === "noResponse").length;
  const warnings = items.filter((i) => i.finding.severity === "warning").length;
  const overdue = o.overdueAuditActions.length;

  const presetMatch = (i: ActionItem) => {
    switch (preset) {
      case "untreatedCritical": return i.finding.severity === "critical" && !i.follow.handled;
      case "noResponse": return i.follow.reminder === "noResponse";
      case "warnings": return i.finding.severity === "warning";
      case "overdue": return i.finding.code === "OpenActionsTooLong";
      default: return matchesActionFilter(i.follow, filter);
    }
  };
  const listed = items.filter(presetMatch);
  const togglePreset = (p: Preset) => setPreset((cur) => (cur === p ? null : p));

  const interpretation = interpret(score, followRate);

  return (
    <div className="space-y-6">
      {/* a) Score and follow-up */}
      <Card>
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                {t("audit.overview.scoreTitle")} <InfoTip k="audit.overview.scoreHelp" />
              </div>
              <ComplianceScoreRing score={score} label={t("audit.overview.scoreSub")} />
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setExplainOpen(true)}>
                {t("audit.overview.howCalculated")}
              </Button>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                {t("audit.overview.followUpTitle")} <InfoTip k="audit.overview.followUpHelp" />
              </div>
              <ComplianceScoreRing score={followRate} label={t("audit.overview.followUpSub")} />
              <span className="text-xs text-muted-foreground text-center">
                {t("audit.overview.followUpCount", {
                  handled: followUpBase.filter((f) => (f.severity === "critical" || f.severity === "warning") && followState(f).handled).length,
                  total: followUpBase.filter((f) => f.severity === "critical" || f.severity === "warning").length,
                })}
              </span>
            </div>
          </div>
          <p className="text-sm text-center text-muted-foreground border-t border-border pt-3">
            {t(`audit.overview.interpret.${interpretation}`)}
          </p>
        </CardContent>
      </Card>

      {/* b) Key metrics */}
      <KeyMetrics dept={dept} onNavigate={onNavigate} />

      {/* c) KPIs (filter the list) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={AlertOctagon}
          label={t("audit.overview.kpi.untreatedCritical.label")}
          value={untreatedCritical}
          tone={untreatedCritical > 0 ? "danger" : "success"}
          active={preset === "untreatedCritical"}
          onClick={() => togglePreset("untreatedCritical")}
          info={<InfoTip k="audit.overview.kpi.untreatedCritical" />}
        />
        <KpiCard
          icon={Hourglass}
          label={t("audit.overview.kpi.noResponse.label")}
          value={noResponse}
          tone={noResponse > 0 ? "warning" : "success"}
          active={preset === "noResponse"}
          onClick={() => togglePreset("noResponse")}
          info={<InfoTip k="audit.overview.kpi.noResponse" />}
        />
        <KpiCard
          icon={AlertTriangle}
          label={t("audit.overview.kpi.warnings.label")}
          value={warnings}
          tone={warnings > 0 ? "warning" : "success"}
          active={preset === "warnings"}
          onClick={() => togglePreset("warnings")}
          info={<InfoTip k="audit.overview.kpi.warnings" />}
        />
        <KpiCard
          icon={CalendarClock}
          label={t("audit.overview.kpi.overdue.label")}
          value={overdue}
          tone={overdue > 0 ? "danger" : "success"}
          active={preset === "overdue"}
          onClick={() => togglePreset("overdue")}
          info={<InfoTip k="audit.overview.kpi.overdue" />}
        />
      </div>

      {/* d) Requires action now */}
      <ActionList
        items={listed}
        filter={filter}
        onFilterChange={(f) => { setFilter(f); setPreset(null); }}
        presetLabel={preset ? t(`audit.overview.kpi.${preset}.label`) : null}
        onClearPreset={() => setPreset(null)}
        showDepartment={!dept && departments.length > 1}
      />

      {/* e) Departments */}
      {!dept && departments.length > 1 && (
        <DepartmentTable
          rows={departments.map((d) => {
            const ev = o.evaluateDepartment(d.id);
            return {
              id: d.id,
              name: d.name,
              score: ev?.evaluation.overall ?? null,
              critical: ev?.findings.filter((f) => f.severity === "critical").length ?? 0,
              warnings: ev?.findings.filter((f) => f.severity === "warning").length ?? 0,
            };
          })}
          onSelect={setDept}
        />
      )}

      <Dialog open={explainOpen} onOpenChange={setExplainOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] max-h-[85dvh] overflow-y-auto [touch-action:pan-y]">
          <DialogHeader>
            <DialogTitle>{t("audit.overview.explain.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <p>{t("audit.overview.explain.intro")}</p>
            <ul className="space-y-2">
              {CATEGORIES.map((c) => (
                <li key={c} className="rounded-md border border-border p-2">
                  <div className="flex justify-between font-medium">
                    <span>{t(`audit.overview.explain.cat.${c}.name`)}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {o.evaluation?.categories[c].score ?? "—"}{o.evaluation?.categories[c].score != null ? "%" : ""} · 20 %
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">{t(`audit.overview.explain.cat.${c}.counts`)}</div>
                </li>
              ))}
            </ul>
            <p>{t("audit.overview.explain.points")}</p>
            <p className="text-muted-foreground">{t("audit.overview.explain.excluded")}</p>
            <p className="text-muted-foreground">{t("audit.overview.explain.followUp")}</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const toneCls = (tone: MetricTone) =>
  tone === "danger" ? "text-status-red" : tone === "warning" ? "text-status-yellow-text" : "text-foreground";

/** Key-metrics row; follows the department picker, each value opens the relevant tab. */
function KeyMetrics({ dept, onNavigate }: { dept: string | null | undefined; onNavigate: (tab: AuditTabValue, opts?: { auditId?: string }) => void }) {
  const { t } = useTranslation();
  const fleet = useAuditFleet();
  const ops = useAuditOperations();
  const air = airworthyFleet(fleet.data ?? []);
  const base = ops.data?.logCoverageBase ?? {};
  const eligible = dept && dept !== "all" ? base[dept] ?? 0 : Object.values(base).reduce((a, b) => a + b, 0);
  const missing = (ops.data?.issues ?? []).filter((i) => i.code === "missionWithoutFlightLog").length;
  const cov = flightLogCoverage(eligible, missing);
  const of = t("audit.overview.metrics.of");

  const items: { key: string; tab: AuditTabValue; value: string; tone: MetricTone; loading: boolean }[] = [
    { key: "airworthy", tab: "fleet", value: formatShare(air, of), tone: air.tone, loading: fleet.isLoading },
    { key: "logCoverage", tab: "operations", value: formatShare(cov, of), tone: cov.tone, loading: ops.isLoading },
  ];

  return (
    <section className="space-y-2" aria-label={t("audit.overview.metrics.title")}>
      <h3 className="text-sm font-semibold">{t("audit.overview.metrics.title")}</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <AuditProgrammeCard dept={dept} onNavigate={onNavigate} />
        <div className="grid grid-cols-1 gap-3 content-start">
          {items.map((m) => (
            <div key={m.key} className="relative rounded-lg border border-border bg-card p-3">
              <div className="text-xs text-muted-foreground pr-6 truncate">{t(`audit.overview.metrics.${m.key}.label`)}</div>
              <div className="absolute right-2 top-2"><InfoTip k={`audit.overview.metrics.${m.key}`} /></div>
              {m.loading ? <Skeleton className="h-6 w-32 mt-1" /> : (
                <button type="button" onClick={() => onNavigate(m.tab)}
                  className={cn("mt-1 block text-left text-lg font-semibold tabular-nums hover:underline", toneCls(m.tone))}>
                  {m.value}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const PROGRAMME_MAX = 5;

function AuditProgrammeCard({ dept, onNavigate }: { dept: string | null | undefined; onNavigate: (tab: AuditTabValue, opts?: { auditId?: string }) => void }) {
  const { t, i18n } = useTranslation();
  const reviews = useAuditReviews();
  const { data: departments = [], isLoading: deptLoading } = useAuditDepartments();
  const filterUnitId = dept && dept !== "all" ? dept : null;
  const prog = auditProgramme((reviews.data ?? []) as any[], departments, filterUnitId);
  const fmt = (d: Date) => d.toLocaleDateString(i18n.language?.startsWith("en") ? "en-GB" : "nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" });
  const total = prog.upcoming.length + (prog.coverage ? 1 : 0);
  // The coverage warning is always shown; upcoming audits fill the remaining lines.
  const shownReviews = prog.upcoming.slice(0, PROGRAMME_MAX - (prog.coverage ? 1 : 0));

  return (
    <div className="relative rounded-lg border border-border bg-card p-3 md:col-span-2 space-y-2">
      <div className="text-xs text-muted-foreground pr-6">{t("audit.overview.metrics.programme.label")}</div>
      <div className="absolute right-2 top-2"><InfoTip k="audit.overview.metrics.programme" /></div>
      {reviews.isLoading || deptLoading ? <Skeleton className="h-16 w-full" /> : total === 0 ? (
        <p className="text-sm text-muted-foreground">{t("audit.overview.metrics.programme.empty")}</p>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {shownReviews.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onNavigate("internal", { auditId: r.id })}
                  className="w-full flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-left text-sm hover:bg-muted/50 rounded">
                  <span className="font-medium min-w-0 truncate flex-1">{r.title}</span>
                  <span className="text-xs text-muted-foreground">{r.unitName} · {t(`audit.tpl.template.${r.templateKey}`)} · {r.date ? fmt(r.date) : "—"}</span>
                  <Badge variant="outline" className={cn("text-xs", r.overdue && "border-status-red text-status-red")}>
                    {r.overdue ? t("audit.overview.metrics.programme.overdue")
                      : r.status === "in_progress" ? t("audit.internal.statusInProgress") : t("audit.internal.statusPlanned")}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
          {shownCoverage.length > 0 && (
            <ul className="space-y-0.5 text-sm">
              {shownCoverage.map((c) => (
                <li key={c.unitId} className={c.tone === "danger" ? "text-status-red" : "text-status-yellow-text"}>
                  {t(c.tone === "danger" ? "audit.overview.metrics.programme.noAudit" : "audit.overview.metrics.programme.dueSoon", { unit: c.unitName })}
                </li>
              ))}
            </ul>
          )}
          {total > PROGRAMME_MAX && (
            <Button variant="link" size="sm" className="h-auto p-0" onClick={() => onNavigate("internal")}>
              {t("audit.overview.metrics.programme.showAll", { count: total })}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function interpret(score: number | null, follow: number | null): "none" | "goodGood" | "lowHigh" | "highLow" | "lowLow" | "noFindings" {
  if (score == null) return "none";
  if (follow == null) return "noFindings";
  const highScore = score >= 85;
  const highFollow = follow >= 70;
  if (highScore && highFollow) return "goodGood";
  if (!highScore && highFollow) return "lowHigh";
  if (highScore && !highFollow) return "highLow";
  return "lowLow";
}

function DepartmentTable({
  rows, onSelect,
}: { rows: { id: string; name: string; score: number | null; critical: number; warnings: number }[]; onSelect: (id: string) => void }) {
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState<"name" | "score" | "critical" | "warnings">("critical");
  const sorted = [...rows].sort((a, b) =>
    sortKey === "name" ? a.name.localeCompare(b.name)
      : sortKey === "score" ? (a.score ?? 101) - (b.score ?? 101)
        : b[sortKey] - a[sortKey]);
  const scoreCls = (s: number | null) => (s == null ? "text-muted-foreground" : s >= 85 ? "text-status-green" : s >= 65 ? "text-status-yellow-text" : "text-status-red");
  const Head = ({ k, label, right }: { k: typeof sortKey; label: string; right?: boolean }) => (
    <th className={cn("px-3 py-2 text-xs font-medium text-muted-foreground", right ? "text-right" : "text-left")}>
      <button type="button" className={cn("hover:text-foreground", sortKey === k && "text-foreground underline")} onClick={() => setSortKey(k)}>{label}</button>
    </th>
  );
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-1.5">
          <h3 className="text-base font-semibold">{t("audit.overview.departments.title")}</h3>
          <InfoTip k="audit.overview.departments.help" />
        </div>
        <table className="hidden md:table w-full text-sm">
          <thead className="border-b border-border">
            <tr>
              <Head k="name" label={t("audit.overview.departments.department")} />
              <Head k="score" label={t("audit.overview.departments.score")} right />
              <Head k="critical" label={t("audit.overview.departments.critical")} right />
              <Head k="warnings" label={t("audit.overview.departments.warnings")} right />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((r) => (
              <tr key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onSelect(r.id)}>
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", scoreCls(r.score))}>{r.score == null ? "—" : `${r.score}%`}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums", r.critical > 0 && "text-status-red font-semibold")}>{r.critical}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums", r.warnings > 0 && "text-status-yellow-text")}>{r.warnings}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="md:hidden space-y-2">
          {sorted.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => onSelect(r.id)} className="w-full rounded-lg border border-border p-3 text-left hover:bg-muted/50">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{r.name}</span>
                  <span className={cn("font-semibold tabular-nums", scoreCls(r.score))}>{r.score == null ? "—" : `${r.score}%`}</span>
                </div>
                <div className="mt-1 flex gap-3 text-xs">
                  <span className={r.critical > 0 ? "text-status-red" : "text-muted-foreground"}>{t("audit.overview.departments.criticalCount", { count: r.critical })}</span>
                  <span className={r.warnings > 0 ? "text-status-yellow-text" : "text-muted-foreground"}>{t("audit.overview.departments.warningCount", { count: r.warnings })}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <Card><CardContent className="p-4 space-y-3">
        <Skeleton className="h-5 w-48" />
        <div className="flex gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-24" />)}</div>
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </CardContent></Card>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      <Card><CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6 justify-items-center">
        <Skeleton className="h-40 w-40 rounded-full" /><Skeleton className="h-40 w-40 rounded-full" />
      </CardContent></Card>
    </div>
  );
}
