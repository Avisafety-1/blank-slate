import { ReactNode, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardCheck, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useChecklists } from "@/hooks/useChecklists";
import { calculateMaintenanceStatus, calculateUsageStatus, worstStatus } from "@/lib/maintenanceStatus";
import {
  MaintenanceSchedule,
  ScheduleKind,
  fetchSchedulesForResources,
  performSchedule,
  scheduleDaysLeft,
} from "@/lib/maintenanceSchedules";
import { ChecklistExecutionDialog } from "./ChecklistExecutionDialog";
import { Status } from "@/types";

export interface StandardInspectionInput {
  lastAt: string | null;
  nextAt: string | null;
  intervalDays: number | null;
  intervalHours: number | null;
  intervalMissions: number | null;
  warnDays?: number | null;
  warnHours?: number | null;
  warnMissions?: number | null;
  hoursUsed: number;
  missionsUsed: number;
  checklistId?: string | null;
  /** Battery charge cycles (batteries only) */
  intervalCycles?: number | null;
  warnCycles?: number | null;
  cyclesUsed?: number;
}

interface Props {
  kind: ScheduleKind;
  resourceId: string;
  companyId: string | null;
  standard: StandardInspectionInput;
  totals: { totalHours: number; totalMissions: number; totalCycles?: number | null };
  /** Rendered on the right of the header for the standard inspection tab */
  actionSlot?: ReactNode;
  /** Reload trigger */
  refreshKey?: unknown;
  /** Enables "perform maintenance" on custom inspection tabs */
  userId?: string | null;
  resourceName?: string;
  onPerformed?: () => void;
}


interface InspectionView {
  id: string;
  name: string;
  status: Status;
  daysLeft: number | null;
  lastAt: string | null;
  nextAt: string | null;
  checklistId: string | null;
  isStandard: boolean;
  bars: { key: string; label: string; used: number; limit: number; status: Status; decimals: number; unit?: string }[];
}

const barClasses = (status: Status) =>
  status === "Rød"
    ? "bg-gradient-to-r from-red-600 to-red-400"
    : status === "Gul"
      ? "bg-gradient-to-r from-orange-600 to-amber-400"
      : "bg-gradient-to-r from-emerald-600 to-emerald-400";

const textClasses = (status: Status) =>
  status === "Rød"
    ? "text-red-600 dark:text-red-400"
    : status === "Gul"
      ? "text-orange-600 dark:text-orange-400"
      : "text-emerald-700 dark:text-emerald-400";

const ringClasses = (status: Status) =>
  status === "Rød"
    ? "bg-red-500"
    : status === "Gul"
      ? "bg-orange-500"
      : "bg-emerald-500";

export const InspectionOverview = ({
  kind,
  resourceId,
  companyId,
  standard,
  totals,
  actionSlot,
  refreshKey,
}: Props) => {
  const { t } = useTranslation();
  const { checklists } = useChecklists();
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const map = await fetchSchedulesForResources(kind, [resourceId]);
        if (!cancelled) setSchedules(map[resourceId] || []);
      } catch (err) {
        console.error("Failed to load maintenance schedules:", err);
      }
    };
    if (resourceId) load();
    return () => {
      cancelled = true;
    };
  }, [kind, resourceId, refreshKey]);

  const checklistTitle = (id: string | null) =>
    id ? checklists.find((c) => c.id === id)?.tittel ?? null : null;

  const views = useMemo<InspectionView[]>(() => {
    const items: InspectionView[] = [];

    const standardBars: InspectionView["bars"] = [];
    if (standard.intervalHours) {
      standardBars.push({
        key: "hours",
        label: t("maintenance.hoursBar"),
        used: standard.hoursUsed,
        limit: standard.intervalHours,
        status: calculateUsageStatus(standard.hoursUsed, standard.intervalHours, standard.warnHours ?? null),
        decimals: 1,
        unit: "t",
      });
    }
    if (standard.intervalMissions) {
      standardBars.push({
        key: "missions",
        label: t("maintenance.missionsBar"),
        used: standard.missionsUsed,
        limit: standard.intervalMissions,
        status: calculateUsageStatus(standard.missionsUsed, standard.intervalMissions, standard.warnMissions ?? null),
        decimals: 0,
      });
    }
    const standardDateStatus = calculateMaintenanceStatus(standard.nextAt, standard.warnDays ?? 14);
    const hasStandard =
      !!standard.lastAt || !!standard.nextAt || !!standard.intervalDays || standardBars.length > 0;
    if (hasStandard) {
      items.push({
        id: "standard",
        name: t("maintenance.schedules.standardTab"),
        status: standardBars.reduce((w, b) => worstStatus(w, b.status), standardDateStatus),
        daysLeft: daysUntil(standard.nextAt),
        lastAt: standard.lastAt,
        nextAt: standard.nextAt,
        checklistId: standard.checklistId ?? null,
        isStandard: true,
        bars: standardBars,
      });
    }

    schedules.forEach((s) => {
      const hoursUsed = Math.max(0, (totals.totalHours ?? 0) - (s.hours_at_last ?? 0));
      const missionsUsed = Math.max(0, (totals.totalMissions ?? 0) - (s.missions_at_last ?? 0));
      const bars: InspectionView["bars"] = [];
      if (s.interval_hours) {
        bars.push({
          key: "hours",
          label: t("maintenance.hoursBar"),
          used: hoursUsed,
          limit: s.interval_hours,
          status: calculateUsageStatus(hoursUsed, s.interval_hours, s.warn_hours),
          decimals: 1,
          unit: "t",
        });
      }
      if (s.interval_missions) {
        bars.push({
          key: "missions",
          label: t("maintenance.missionsBar"),
          used: missionsUsed,
          limit: s.interval_missions,
          status: calculateUsageStatus(missionsUsed, s.interval_missions, s.warn_missions),
          decimals: 0,
        });
      }
      const dateStatus = calculateMaintenanceStatus(s.next_due_date, s.warn_days ?? 14);
      items.push({
        id: s.id,
        name: s.navn,
        status: bars.reduce((w, b) => worstStatus(w, b.status), dateStatus),
        daysLeft: scheduleDaysLeft(s),
        lastAt: s.last_performed_at,
        nextAt: s.next_due_date,
        checklistId: s.sjekkliste_id,
        isStandard: false,
        bars,
      });
    });

    const rank = (v: InspectionView) => {
      const dayScore = v.daysLeft == null ? 9_999 : v.daysLeft;
      const usageScore = v.bars.reduce((max, b) => Math.max(max, b.limit ? (b.used / b.limit) * 100 : 0), 0);
      // Convert usage to a comparable "days-like" urgency so bars can outrank dates
      const usageDays = usageScore >= 100 ? -1 : (100 - usageScore) * 2;
      return Math.min(dayScore, v.bars.length ? usageDays : 9_999);
    };

    return items.sort((a, b) => rank(a) - rank(b));
  }, [schedules, standard, totals, t]);

  useEffect(() => {
    if (views.length === 0) return;
    if (activeId && views.some((v) => v.id === activeId)) return;
    setActiveId(views[0].id);
  }, [views, activeId]);

  if (views.length === 0) return null;

  const active = views.find((v) => v.id === activeId) ?? views[0];
  const soonest = views[0];

  return (
    <div className="rounded-xl border border-border/70 bg-background/60 p-3 sm:p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Wrench className="w-4 h-4 text-primary" />
          {t("maintenance.inspectionsTitle")}
        </p>
        {active.isStandard && actionSlot}
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 gap-1.5">
        {views.map((v) => {
          const isActive = v.id === active.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setActiveId(v.id)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${ringClasses(v.status)}`} />
              <span className="max-w-[10rem] truncate">{v.name}</span>
              {v.id === soonest.id && views.length > 1 && (
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-semibold">
                  {t("maintenance.nextUpBadge")}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Active inspection */}
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <CalendarClock className="w-3.5 h-3.5" />
            {t("maintenance.lastDone")}:{" "}
            <span className="text-foreground">
              {active.lastAt ? new Date(active.lastAt).toLocaleDateString() : "–"}
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <CalendarClock className="w-3.5 h-3.5" />
            {t("maintenance.nextDue")}:{" "}
            <span className={`font-semibold ${textClasses(active.status)}`}>
              {active.nextAt ? new Date(active.nextAt).toLocaleDateString() : "–"}
            </span>
          </span>
          {active.daysLeft != null && (
            <span className={`flex items-center gap-1 font-semibold ${textClasses(active.status)}`}>
              {active.daysLeft < 0 ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {t("maintenance.inspectionOverdue", { days: Math.abs(active.daysLeft) })}
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {t("maintenance.inspectionDaysLeft", { days: active.daysLeft })}
                </>
              )}
            </span>
          )}
        </div>

        <p className="text-xs flex items-center gap-1.5 text-muted-foreground">
          <ClipboardCheck className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate text-foreground">
            {checklistTitle(active.checklistId) ?? t("maintenance.noChecklist")}
          </span>
        </p>

        {active.bars.length > 0 ? (
          <div className="space-y-2.5">
            {active.bars.map((b) => {
              const pct = Math.min(100, b.limit ? (b.used / b.limit) * 100 : 0);
              return (
                <div key={b.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{b.label}</span>
                    <span className={`font-semibold tabular-nums ${textClasses(b.status)}`}>
                      {b.used.toFixed(b.decimals)} / {b.limit}
                      {b.unit ? ` ${b.unit}` : ""}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full transition-all ${barClasses(b.status)}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("maintenance.dateOnlyInterval")}</p>
        )}
      </div>
    </div>
  );
};

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return Math.floor((next.getTime() - today.getTime()) / 86400000);
}

export default InspectionOverview;
