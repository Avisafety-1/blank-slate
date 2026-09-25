import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { ChevronLeft, ChevronRight, AlertTriangle, Plane, Users, Wrench, Calendar, Clock3 } from "lucide-react";
import { addWeeks, eachDayOfInterval, endOfWeek, format, getWeek, isSameDay, isWithinInterval, startOfWeek, subWeeks } from "date-fns";
import { nb, enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { MissionDetailDialog } from "@/components/dashboard/MissionDetailDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";

type TimelineEventType = "mission" | "maintenance" | "calendar";
type ResourceType = "drone" | "equipment" | "personnel" | "calendar";

interface TimelineEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  status?: string;
  eventType: TimelineEventType;
  resourceName?: string;
  resourceType?: Exclude<ResourceType, "calendar">;
}

interface ResourceRow {
  id: string;
  name: string;
  type: ResourceType;
  events: TimelineEvent[];
}

interface ResourceGroup {
  type: ResourceType;
  title: string;
  icon: typeof Plane;
  rows: ResourceRow[];
}

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;
const MAINTENANCE_DURATION_MS = 60 * 60 * 1000;

const EVENT_STYLES: Record<TimelineEventType, string> = {
  mission: "border-timeline-mission bg-timeline-mission/15 text-foreground",
  maintenance: "border-timeline-maintenance bg-timeline-maintenance/15 text-foreground",
  calendar: "border-timeline-calendar bg-timeline-calendar/15 text-foreground",
};

const checkOverlap = (a: TimelineEvent, b: TimelineEvent) => a.start < b.end && a.end > b.start;

export function ResourceTimeline() {
  const isMobile = useIsMobile();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith("en") ? enUS : nb;
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [resourceRows, setResourceRows] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(isMobile ? 150 : 100);
  const [selectedMission, setSelectedMission] = useState<any | null>(null);
  const [missionDetailOpen, setMissionDetailOpen] = useState(false);
  const [maintenanceDetailOpen, setMaintenanceDetailOpen] = useState(false);
  const [selectedMaintenanceEvent, setSelectedMaintenanceEvent] = useState<TimelineEvent | null>(null);

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const daysOfWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const weekNumber = getWeek(weekStart, { weekStartsOn: 1 });
  const weekStartMs = weekStart.getTime();
  const weekEndMs = weekEnd.getTime();
  const weekDurationMs = weekEndMs - weekStartMs;
  const resourceColumnWidth = isMobile ? 132 : 184;
  const timelineWidth = Math.round((isMobile ? 860 : 1040) * (zoom / 100));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [missionsResult, dronesResult, equipmentResult, accessoriesResult, calendarEventsResult] = await Promise.all([
        supabase.from("missions").select("id, tittel, tidspunkt, slutt_tidspunkt, status").in("status", ["Planlagt", "Pågående"]),
        supabase.from("drones").select("id, modell, serienummer, neste_inspeksjon, sjekkliste_id").eq("aktiv", true),
        supabase.from("equipment").select("id, navn, type, neste_vedlikehold, sjekkliste_id").eq("aktiv", true),
        supabase.from("drone_accessories").select("id, navn, drone_id, neste_vedlikehold"),
        supabase.from("calendar_events").select("id, title, event_date, event_time, type"),
      ]);

      const missions = missionsResult.data || [];
      const droneRows = new Map<string, ResourceRow>();
      const personnelRows = new Map<string, ResourceRow>();
      const equipmentRows = new Map<string, ResourceRow>();
      const calendarRows = new Map<string, ResourceRow>();

      for (const drone of dronesResult.data || []) {
        droneRows.set(drone.id, { id: drone.id, name: drone.modell, type: "drone", events: [] });
        if (drone.neste_inspeksjon) {
          const start = new Date(drone.neste_inspeksjon);
          droneRows.get(drone.id)?.events.push({ id: `insp-${drone.id}`, title: t("pages.calendar.resourceTimeline.inspection"), start, end: new Date(start.getTime() + MAINTENANCE_DURATION_MS), eventType: "maintenance", resourceName: drone.modell, resourceType: "drone" });
        }
      }

      for (const equipment of equipmentResult.data || []) {
        equipmentRows.set(equipment.id, { id: equipment.id, name: equipment.navn, type: "equipment", events: [] });
        if (equipment.neste_vedlikehold) {
          const start = new Date(equipment.neste_vedlikehold);
          equipmentRows.get(equipment.id)?.events.push({ id: `maint-${equipment.id}`, title: t("pages.calendar.resourceTimeline.maintenance"), start, end: new Date(start.getTime() + MAINTENANCE_DURATION_MS), eventType: "maintenance", resourceName: equipment.navn, resourceType: "equipment" });
        }
      }

      for (const accessory of accessoriesResult.data || []) {
        if (!accessory.neste_vedlikehold || !accessory.drone_id) continue;
        const parentDrone = droneRows.get(accessory.drone_id);
        if (!parentDrone) continue;
        const start = new Date(accessory.neste_vedlikehold);
        parentDrone.events.push({ id: `acc-maint-${accessory.id}`, title: `${accessory.navn} · ${t("pages.calendar.resourceTimeline.maintenance")}`, start, end: new Date(start.getTime() + MAINTENANCE_DURATION_MS), eventType: "maintenance", resourceName: parentDrone.name, resourceType: "drone" });
      }

      if (missions.length > 0) {
        const missionIds = missions.map((mission) => mission.id);
        const [droneLinks, personnelLinks, equipmentLinks] = await Promise.all([
          supabase.from("mission_drones").select("mission_id, drone_id, drones(id, modell, serienummer)").in("mission_id", missionIds),
          supabase.from("mission_personnel").select("mission_id, profile_id, profiles(id, full_name)").in("mission_id", missionIds),
          supabase.from("mission_equipment").select("mission_id, equipment_id, equipment(id, navn, type)").in("mission_id", missionIds),
        ]);
        const missionMap = new Map(missions.map((mission) => [mission.id, mission]));
        const makeEvent = (missionId: string): TimelineEvent | null => {
          const mission = missionMap.get(missionId);
          if (!mission) return null;
          const start = new Date(mission.tidspunkt);
          return { id: mission.id, title: mission.tittel, start, end: mission.slutt_tidspunkt ? new Date(mission.slutt_tidspunkt) : new Date(start.getTime() + DEFAULT_DURATION_MS), status: mission.status, eventType: "mission" };
        };

        for (const link of droneLinks.data || []) {
          const drone = link.drones as any;
          const event = makeEvent(link.mission_id);
          if (!drone || !event) continue;
          if (!droneRows.has(drone.id)) droneRows.set(drone.id, { id: drone.id, name: drone.modell, type: "drone", events: [] });
          droneRows.get(drone.id)?.events.push(event);
        }
        for (const link of personnelLinks.data || []) {
          const profile = link.profiles as any;
          const event = makeEvent(link.mission_id);
          if (!profile || !event) continue;
          if (!personnelRows.has(profile.id)) personnelRows.set(profile.id, { id: profile.id, name: profile.full_name || t("pages.calendar.resourceTimeline.unknown"), type: "personnel", events: [] });
          personnelRows.get(profile.id)?.events.push(event);
        }
        for (const link of equipmentLinks.data || []) {
          const equipment = link.equipment as any;
          const event = makeEvent(link.mission_id);
          if (!equipment || !event) continue;
          if (!equipmentRows.has(equipment.id)) equipmentRows.set(equipment.id, { id: equipment.id, name: equipment.navn, type: "equipment", events: [] });
          equipmentRows.get(equipment.id)?.events.push(event);
        }
      }

      for (const item of calendarEventsResult.data || []) {
        const start = new Date(item.event_date);
        if (item.event_time) {
          const [hours, minutes] = item.event_time.split(":").map(Number);
          start.setHours(hours || 0, minutes || 0);
        }
        const typeLabel = item.type || t("pages.calendar.other");
        const rowId = `cal-type-${typeLabel}`;
        if (!calendarRows.has(rowId)) calendarRows.set(rowId, { id: rowId, name: t(`pages.calendar.eventTypes.${typeLabel}`, { defaultValue: typeLabel }), type: "calendar", events: [] });
        calendarRows.get(rowId)?.events.push({ id: `cal-${item.id}`, title: item.title, start, end: new Date(start.getTime() + MAINTENANCE_DURATION_MS), eventType: "calendar" });
      }

      setResourceRows([...droneRows.values(), ...personnelRows.values(), ...equipmentRows.values(), ...calendarRows.values()]);
    } catch (error) {
      console.error("ResourceTimeline fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const eventOverlapsWeek = useCallback((event: TimelineEvent) => event.end.getTime() > weekStartMs && event.start.getTime() < weekEndMs, [weekEndMs, weekStartMs]);
  const visibleRows = useMemo(() => resourceRows.map((row) => ({ ...row, events: row.events.filter(eventOverlapsWeek) })).filter((row) => row.events.length > 0), [eventOverlapsWeek, resourceRows]);
  const groups = useMemo<ResourceGroup[]>(() => {
    const allGroups: ResourceGroup[] = [
      { type: "drone", title: t("pages.calendar.resourceTimeline.drones"), icon: Plane, rows: visibleRows.filter((row) => row.type === "drone") },
      { type: "personnel", title: t("pages.calendar.resourceTimeline.personnel"), icon: Users, rows: visibleRows.filter((row) => row.type === "personnel") },
      { type: "equipment", title: t("pages.calendar.resourceTimeline.equipment"), icon: Wrench, rows: visibleRows.filter((row) => row.type === "equipment") },
      { type: "calendar", title: t("pages.calendar.resourceTimeline.calendar"), icon: Calendar, rows: visibleRows.filter((row) => row.type === "calendar") },
    ];
    return allGroups.filter((group) => group.rows.length > 0);
  }, [t, visibleRows]);

  const conflictCount = useMemo(() => visibleRows.reduce((count, row) => count + row.events.filter((event) => event.eventType === "mission" && row.events.some((other) => other.id !== event.id && other.eventType === "mission" && checkOverlap(event, other))).length, 0), [visibleRows]);
  const activeMissionCount = useMemo(() => new Set(visibleRows.flatMap((row) => row.events.filter((event) => event.eventType === "mission").map((event) => event.id))).size, [visibleRows]);
  const now = new Date();
  const showNow = isWithinInterval(now, { start: weekStart, end: weekEnd });
  const nowPosition = ((now.getTime() - weekStartMs) / weekDurationMs) * 100;

  const openMission = async (missionId: string) => {
    const { data, error } = await supabase.from("missions").select("*").eq("id", missionId).single();
    if (error) {
      console.error("Error loading mission:", error);
      return;
    }
    setSelectedMission(data);
    setMissionDetailOpen(true);
  };

  const assignLanes = (events: TimelineEvent[]) => {
    const laneEnds: number[] = [];
    return [...events].sort((a, b) => a.start.getTime() - b.start.getTime()).map((event) => {
      let lane = laneEnds.findIndex((end) => end <= event.start.getTime());
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = event.end.getTime();
      return { event, lane };
    });
  };

  const renderEvent = (event: TimelineEvent, row: ResourceRow, lane: number) => {
    const start = Math.max(event.start.getTime(), weekStartMs);
    const end = Math.min(event.end.getTime(), weekEndMs);
    const left = ((start - weekStartMs) / weekDurationMs) * 100;
    const width = ((end - start) / weekDurationMs) * 100;
    const conflict = event.eventType === "mission" && row.events.some((other) => other.id !== event.id && other.eventType === "mission" && checkOverlap(event, other));
    const clickable = event.eventType !== "calendar";
    const onClick = event.eventType === "mission" ? () => void openMission(event.id) : event.eventType === "maintenance" ? () => { setSelectedMaintenanceEvent(event); setMaintenanceDetailOpen(true); } : undefined;

    return (
      <TooltipProvider key={`${row.id}-${event.id}`} delayDuration={180}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onClick}
              disabled={!clickable}
              className={cn("absolute min-w-8 overflow-hidden rounded border border-l-[3px] px-2 text-left shadow-sm transition-[filter,transform] duration-150", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", clickable && "hover:brightness-110 active:translate-y-px", EVENT_STYLES[event.eventType], conflict && "border-timeline-conflict ring-1 ring-timeline-conflict")}
              style={{ left: `${left}%`, width: `${Math.max(width, 1.25)}%`, top: `${7 + lane * 40}px`, height: "34px" }}
              aria-label={`${event.title}, ${format(event.start, "HH:mm")}–${format(event.end, "HH:mm")}`}
            >
              <span className="flex items-center gap-1 truncate font-display text-[11px] font-semibold leading-tight">
                {conflict && <AlertTriangle className="h-3 w-3 shrink-0 text-timeline-conflict" />}
                {event.title}
              </span>
              <span className="block truncate font-mono text-[9px] text-muted-foreground">{format(event.start, "HH:mm")}–{format(event.end, "HH:mm")}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="font-display font-semibold">{event.title}</p>
            <p className="text-xs text-muted-foreground">{format(event.start, "EEE dd.MM HH:mm", { locale: dateLocale })} – {format(event.end, "EEE dd.MM HH:mm", { locale: dateLocale })}</p>
            {conflict && <p className="mt-1 flex items-center gap-1 text-xs text-timeline-conflict"><AlertTriangle className="h-3 w-3" />{t("pages.calendar.resourceTimeline.resourceConflict")}</p>}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div className="overflow-hidden rounded-md border border-timeline-grid bg-timeline-surface font-operational shadow-sm">
      <div className="flex flex-col gap-4 border-b border-timeline-grid bg-timeline-surface-strong/70 p-3 lg:flex-row lg:items-center lg:justify-between lg:p-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-sm bg-foreground px-2 py-1 font-display text-[11px] font-bold text-background">AVISAFE</div>
          <div className="min-w-0">
            <h2 className="truncate font-display text-sm font-semibold text-foreground">{t("pages.calendar.resourceTimeline.title")}</h2>
            <p className="truncate text-[11px] text-muted-foreground">{t("pages.calendar.resourceTimeline.week", { num: weekNumber, year: format(weekStart, "yyyy") })} · {format(weekStart, "d. MMM", { locale: dateLocale })}–{format(weekEnd, "d. MMM", { locale: dateLocale })}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 lg:justify-end">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setWeekStart((value) => subWeeks(value, 1))} aria-label={t("pages.calendar.resourceTimeline.previousWeek")}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>{t("pages.calendar.resourceTimeline.today")}</Button>
            <Button variant="outline" size="icon" onClick={() => setWeekStart((value) => addWeeks(value, 1))} aria-label={t("pages.calendar.resourceTimeline.nextWeek")}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="flex min-w-44 items-center gap-3">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">{t("pages.calendar.resourceTimeline.zoom")}</span>
            <Slider value={[zoom]} onValueChange={(value) => setZoom(value[0] ?? 100)} min={80} max={220} step={10} aria-label={t("pages.calendar.resourceTimeline.zoom")} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-timeline-grid px-3 py-2 text-[11px] text-muted-foreground lg:px-4">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-timeline-mission" />{t("pages.calendar.resourceTimeline.missions")}</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-timeline-maintenance" />{t("pages.calendar.resourceTimeline.maintenance")}</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-timeline-calendar" />{t("pages.calendar.resourceTimeline.calendar")}</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">{t("pages.calendar.resourceTimeline.loading")}</div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center text-muted-foreground"><p className="text-sm">{t("pages.calendar.resourceTimeline.empty")}</p><p className="mt-1 text-xs">{t("pages.calendar.resourceTimeline.emptyHint")}</p></div>
      ) : (
        <div className="max-h-[68vh] overflow-auto">
          <div style={{ width: `${resourceColumnWidth + timelineWidth}px` }}>
            <div className="sticky top-0 z-30 flex border-b border-timeline-grid bg-timeline-surface">
              <div className="sticky left-0 z-40 flex shrink-0 items-center border-r border-timeline-grid bg-timeline-surface-strong px-3 py-2" style={{ width: resourceColumnWidth }}>
                <span className="font-display text-[10px] font-bold uppercase text-muted-foreground">{t("pages.calendar.resourceTimeline.resources")}</span>
              </div>
              <div className="relative flex" style={{ width: timelineWidth }}>
                {daysOfWeek.map((day) => <div key={day.toISOString()} className={cn("flex-1 border-r border-timeline-grid px-2 py-2 text-center", isSameDay(day, now) && "bg-primary/10")}><span className={cn("font-display text-[11px] font-semibold", isSameDay(day, now) ? "text-primary" : "text-foreground")}>{format(day, isMobile ? "EEEEE d" : "EEE d. MMM", { locale: dateLocale })}</span></div>)}
              </div>
            </div>

            {groups.map((group) => {
              const Icon = group.icon;
              return (
                <section key={group.type}>
                  <div className="sticky left-0 z-20 flex h-8 items-center gap-2 border-b border-timeline-grid bg-timeline-surface-strong px-3" style={{ width: resourceColumnWidth + timelineWidth }}>
                    <Icon className="h-3.5 w-3.5 text-primary" />
                    <h3 className="font-display text-[11px] font-semibold uppercase text-foreground">{group.title}</h3>
                    <Badge variant="secondary" className="h-5 min-w-5 justify-center rounded-sm px-1.5 text-[10px]">{group.rows.length}</Badge>
                  </div>
                  {group.rows.map((row) => {
                    const lanes = assignLanes(row.events);
                    const laneCount = Math.max(1, ...lanes.map((item) => item.lane + 1));
                    const rowHeight = Math.max(54, laneCount * 40 + 10);
                    return (
                      <div key={row.id} className="group flex border-b border-timeline-grid/70" style={{ height: rowHeight }}>
                        <div className="sticky left-0 z-20 flex shrink-0 items-center border-r border-timeline-grid bg-timeline-surface px-3 transition-colors group-hover:bg-timeline-surface-strong" style={{ width: resourceColumnWidth }}>
                          <span className="truncate font-display text-xs font-semibold text-foreground" title={row.name}>{row.name}</span>
                        </div>
                        <div className="relative" style={{ width: timelineWidth }}>
                          <div className="absolute inset-0 flex">{daysOfWeek.map((day) => <div key={day.toISOString()} className={cn("flex-1 border-r border-timeline-grid/70", isSameDay(day, now) && "bg-primary/5")} />)}</div>
                          {showNow && <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-timeline-conflict" style={{ left: `${nowPosition}%` }} />}
                          {lanes.map(({ event, lane }) => renderEvent(event, row, lane))}
                        </div>
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-timeline-grid bg-timeline-surface-strong/70 px-3 py-2 text-[10px] font-medium text-muted-foreground lg:px-4">
        <div className="flex items-center gap-4"><span>{t("pages.calendar.resourceTimeline.activeOperations", { count: activeMissionCount })}</span><span className={cn("flex items-center gap-1", conflictCount > 0 && "text-timeline-conflict")}><AlertTriangle className="h-3 w-3" />{conflictCount > 0 ? t("pages.calendar.resourceTimeline.pendingConflicts", { count: conflictCount }) : t("pages.calendar.resourceTimeline.noConflicts")}</span></div>
        {showNow && <span className="flex items-center gap-1 font-mono"><Clock3 className="h-3 w-3" />{t("pages.calendar.resourceTimeline.currentTime")} {format(now, "HH:mm")}</span>}
      </div>

      <MissionDetailDialog open={missionDetailOpen} onOpenChange={setMissionDetailOpen} mission={selectedMission} />
      <Dialog open={maintenanceDetailOpen} onOpenChange={setMaintenanceDetailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Wrench className="h-5 w-5 text-timeline-maintenance" />{selectedMaintenanceEvent?.title}</DialogTitle></DialogHeader>
          {selectedMaintenanceEvent && <div className="space-y-3 text-sm"><div className="flex justify-between gap-4"><span className="text-muted-foreground">{t("pages.calendar.resourceTimeline.resource")}</span><span className="text-right font-medium">{selectedMaintenanceEvent.resourceName || "—"}</span></div><div className="flex justify-between gap-4"><span className="text-muted-foreground">{t("pages.calendar.resourceTimeline.type")}</span><Badge variant="outline">{selectedMaintenanceEvent.resourceType === "drone" ? t("pages.calendar.resourceTimeline.drone") : t("pages.calendar.resourceTimeline.equipment")}</Badge></div><div className="flex justify-between gap-4"><span className="text-muted-foreground">{t("pages.calendar.resourceTimeline.date")}</span><span className="text-right font-medium">{format(selectedMaintenanceEvent.start, "d. MMMM yyyy", { locale: dateLocale })}</span></div><div className="flex justify-between gap-4"><span className="text-muted-foreground">{t("pages.calendar.resourceTimeline.category")}</span><Badge className="border-timeline-maintenance bg-timeline-maintenance text-timeline-maintenance-foreground">{selectedMaintenanceEvent.title === t("pages.calendar.resourceTimeline.inspection") ? t("pages.calendar.resourceTimeline.inspection") : t("pages.calendar.resourceTimeline.maintenance")}</Badge></div></div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}