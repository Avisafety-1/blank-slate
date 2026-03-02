import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, AlertTriangle, Plane, Users, Wrench, Calendar, FileText } from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, isSameDay, getWeek } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { MissionDetailDialog } from "@/components/dashboard/MissionDetailDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type TimelineEventType = "mission" | "maintenance" | "document" | "calendar";

interface TimelineEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  status?: string;
  eventType: TimelineEventType;
}

interface ResourceRow {
  id: string;
  name: string;
  type: "drone" | "equipment" | "personnel";
  events: TimelineEvent[];
}

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;
const MAINTENANCE_DURATION_MS = 1 * 60 * 60 * 1000; // 1h block for maintenance

const EVENT_COLORS: Record<TimelineEventType, string> = {
  mission: "bg-primary/80 border-primary",
  maintenance: "bg-orange-500/80 border-orange-500",
  document: "bg-blue-400/80 border-blue-400",
  calendar: "bg-purple-500/80 border-purple-500",
};

const MISSION_COLORS = [
  "bg-primary/80 border-primary",
  "bg-blue-500/80 border-blue-500",
  "bg-emerald-500/80 border-emerald-500",
  "bg-violet-500/80 border-violet-500",
  "bg-amber-500/80 border-amber-500",
  "bg-rose-500/80 border-rose-500",
  "bg-cyan-500/80 border-cyan-500",
  "bg-fuchsia-500/80 border-fuchsia-500",
];

const getMissionColor = (missionId: string): string => {
  let hash = 0;
  for (let i = 0; i < missionId.length; i++) {
    hash = ((hash << 5) - hash) + missionId.charCodeAt(i);
    hash |= 0;
  }
  return MISSION_COLORS[Math.abs(hash) % MISSION_COLORS.length];
};

const checkOverlap = (a: TimelineEvent, b: TimelineEvent): boolean => {
  return a.start < b.end && a.end > b.start;
};

export function ResourceTimeline() {
  const isMobile = useIsMobile();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [resourceRows, setResourceRows] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMission, setSelectedMission] = useState<any | null>(null);
  const [missionDetailOpen, setMissionDetailOpen] = useState(false);

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const daysOfWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const weekNumber = getWeek(weekStart, { weekStartsOn: 1 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all data in parallel
      const [
        missionsResult,
        dronesResult,
        equipmentResult,
        accessoriesResult,
      ] = await Promise.all([
        supabase.from("missions").select("id, tittel, tidspunkt, slutt_tidspunkt, status").in("status", ["Planlagt", "Pågående"]),
        supabase.from("drones").select("id, modell, serienummer, neste_inspeksjon, sjekkliste_id").eq("aktiv", true),
        supabase.from("equipment").select("id, navn, type, neste_vedlikehold, sjekkliste_id").eq("aktiv", true),
        supabase.from("drone_accessories").select("id, navn, drone_id, neste_vedlikehold"),
      ]);

      const missions = missionsResult.data || [];
      const allDrones = dronesResult.data || [];
      const allEquipment = equipmentResult.data || [];
      const allAccessories = accessoriesResult.data || [];

      // Build resource row maps
      const droneRows = new Map<string, ResourceRow>();
      const personnelRows = new Map<string, ResourceRow>();
      const equipmentRows = new Map<string, ResourceRow>();

      // Pre-populate drone and equipment rows so maintenance shows even without missions
      for (const drone of allDrones) {
        droneRows.set(drone.id, { id: drone.id, name: drone.modell, type: "drone", events: [] });
        // Add inspection event if exists
        if (drone.neste_inspeksjon) {
          const inspDate = new Date(drone.neste_inspeksjon);
          droneRows.get(drone.id)!.events.push({
            id: `insp-${drone.id}`,
            title: `Inspeksjon`,
            start: inspDate,
            end: new Date(inspDate.getTime() + MAINTENANCE_DURATION_MS),
            eventType: "maintenance",
          });
        }
      }

      for (const eq of allEquipment) {
        equipmentRows.set(eq.id, { id: eq.id, name: eq.navn, type: "equipment", events: [] });
        if (eq.neste_vedlikehold) {
          const maintDate = new Date(eq.neste_vedlikehold);
          equipmentRows.get(eq.id)!.events.push({
            id: `maint-${eq.id}`,
            title: `Vedlikehold`,
            start: maintDate,
            end: new Date(maintDate.getTime() + MAINTENANCE_DURATION_MS),
            eventType: "maintenance",
          });
        }
      }

      // Add accessory maintenance to parent drone
      for (const acc of allAccessories) {
        if (acc.neste_vedlikehold && acc.drone_id && droneRows.has(acc.drone_id)) {
          const maintDate = new Date(acc.neste_vedlikehold);
          droneRows.get(acc.drone_id)!.events.push({
            id: `acc-maint-${acc.id}`,
            title: `${acc.navn} vedlikehold`,
            start: maintDate,
            end: new Date(maintDate.getTime() + MAINTENANCE_DURATION_MS),
            eventType: "maintenance",
          });
        }
      }

      // Process missions and resource links
      if (missions.length > 0) {
        const missionIds = missions.map((m) => m.id);
        const [droneLinks, personnelLinks, equipmentLinks] = await Promise.all([
          supabase.from("mission_drones").select("mission_id, drone_id, drones(id, modell, serienummer)").in("mission_id", missionIds),
          supabase.from("mission_personnel").select("mission_id, profile_id, profiles(id, full_name)").in("mission_id", missionIds),
          supabase.from("mission_equipment").select("mission_id, equipment_id, equipment(id, navn, type)").in("mission_id", missionIds),
        ]);

        const missionMap = new Map(missions.map((m) => [m.id, m]));

        const toTimelineEvent = (missionId: string): TimelineEvent | null => {
          const m = missionMap.get(missionId);
          if (!m) return null;
          const start = new Date(m.tidspunkt);
          const end = m.slutt_tidspunkt ? new Date(m.slutt_tidspunkt) : new Date(start.getTime() + DEFAULT_DURATION_MS);
          return { id: m.id, title: m.tittel, start, end, status: m.status, eventType: "mission" };
        };

        for (const link of droneLinks.data || []) {
          const drone = link.drones as any;
          if (!drone) continue;
          const ev = toTimelineEvent(link.mission_id);
          if (!ev) continue;
          if (!droneRows.has(drone.id)) {
            droneRows.set(drone.id, { id: drone.id, name: drone.modell, type: "drone", events: [] });
          }
          droneRows.get(drone.id)!.events.push(ev);
        }

        for (const link of personnelLinks.data || []) {
          const profile = link.profiles as any;
          if (!profile) continue;
          const ev = toTimelineEvent(link.mission_id);
          if (!ev) continue;
          if (!personnelRows.has(profile.id)) {
            personnelRows.set(profile.id, { id: profile.id, name: profile.full_name || "Ukjent", type: "personnel", events: [] });
          }
          personnelRows.get(profile.id)!.events.push(ev);
        }

        for (const link of equipmentLinks.data || []) {
          const eq = link.equipment as any;
          if (!eq) continue;
          const ev = toTimelineEvent(link.mission_id);
          if (!ev) continue;
          if (!equipmentRows.has(eq.id)) {
            equipmentRows.set(eq.id, { id: eq.id, name: eq.navn, type: "equipment", events: [] });
          }
          equipmentRows.get(eq.id)!.events.push(ev);
        }
      }

      // Filter: only show rows that have events visible in any timeframe (or always show if they have maintenance)
      const hasAnyEvents = (row: ResourceRow) => row.events.length > 0;

      setResourceRows([
        ...Array.from(droneRows.values()).filter(hasAnyEvents),
        ...Array.from(personnelRows.values()).filter(hasAnyEvents),
        ...Array.from(equipmentRows.values()).filter(hasAnyEvents),
      ]);
    } catch (err) {
      console.error("ResourceTimeline fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleMissionClick = async (missionId: string) => {
    try {
      const { data, error } = await supabase
        .from("missions")
        .select("*")
        .eq("id", missionId)
        .single();
      if (error) throw error;
      setSelectedMission(data);
      setMissionDetailOpen(true);
    } catch (err) {
      console.error("Error loading mission:", err);
    }
  };

  // Group rows by type
  const droneResources = resourceRows.filter((r) => r.type === "drone");
  const personnelResources = resourceRows.filter((r) => r.type === "personnel");
  const equipmentResources = resourceRows.filter((r) => r.type === "equipment");

  const weekStartMs = weekStart.getTime();
  const weekEndMs = weekEnd.getTime();
  const weekDurationMs = weekEndMs - weekStartMs;

  const renderEventBlock = (event: TimelineEvent, row: ResourceRow) => {
    const mStart = Math.max(event.start.getTime(), weekStartMs);
    const mEnd = Math.min(event.end.getTime(), weekEndMs);
    if (mEnd <= mStart) return null;

    const leftPct = ((mStart - weekStartMs) / weekDurationMs) * 100;
    const widthPct = ((mEnd - mStart) / weekDurationMs) * 100;

    const hasConflict = event.eventType === "mission" && row.events.some(
      (other) => other.id !== event.id && other.eventType === "mission" && checkOverlap(event, other)
    );

    const color = event.eventType === "mission" 
      ? getMissionColor(event.id) 
      : EVENT_COLORS[event.eventType];

    const isClickable = event.eventType === "mission";

    const blockContent = (
      <span className="flex items-center gap-1 truncate">
        {hasConflict && <AlertTriangle className="w-3 h-3 flex-shrink-0 text-amber-200" />}
        {event.eventType === "maintenance" && <Wrench className="w-3 h-3 flex-shrink-0" />}
        {event.title}
      </span>
    );

    return (
      <TooltipProvider key={event.id} delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={isClickable ? () => handleMissionClick(event.id) : undefined}
              className={cn(
                "absolute top-1 h-7 rounded-md border text-[10px] sm:text-xs font-medium text-white px-1.5 truncate transition-opacity hover:opacity-90 z-10",
                isClickable ? "cursor-pointer" : "cursor-default",
                color,
                hasConflict && "ring-2 ring-amber-400 ring-offset-1 ring-offset-background"
              )}
              style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 2)}%` }}
            >
              {blockContent}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="font-semibold">{event.title}</p>
            <p className="text-xs text-muted-foreground">
              {format(event.start, "EEE dd.MM HH:mm", { locale: nb })} – {format(event.end, "HH:mm", { locale: nb })}
            </p>
            {event.eventType !== "mission" && (
              <Badge variant="outline" className="text-[10px] mt-1 capitalize">
                {event.eventType === "maintenance" ? "Vedlikehold" : event.eventType}
              </Badge>
            )}
            {hasConflict && (
              <p className="text-xs text-amber-500 flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3 h-3" /> Ressurskonflikt
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const renderSection = (title: string, icon: React.ReactNode, rows: ResourceRow[]) => {
    if (rows.length === 0) return null;
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <Badge variant="secondary" className="text-xs">{rows.length}</Badge>
        </div>
        <div className="border border-border rounded-lg overflow-hidden">
          {rows.map((row, idx) => {
            const visibleEvents = row.events.filter((e) => {
              return e.end.getTime() > weekStartMs && e.start.getTime() < weekEndMs;
            });
            return (
              <div
                key={row.id}
                className={cn(
                  "flex items-stretch min-h-[36px]",
                  idx > 0 && "border-t border-border"
                )}
              >
                <div className="w-28 sm:w-36 flex-shrink-0 px-2 py-1.5 bg-muted/50 flex items-center">
                  <span className="text-xs sm:text-sm font-medium truncate">{row.name}</span>
                </div>
                <div className="flex-1 relative">
                  {/* Day grid lines */}
                  <div className="absolute inset-0 flex">
                    {daysOfWeek.map((day, i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex-1",
                          i > 0 && "border-l border-border/50",
                          isSameDay(day, new Date()) && "bg-primary/5"
                        )}
                      />
                    ))}
                  </div>
                  {/* Event blocks */}
                  {visibleEvents.map((e) => renderEventBlock(e, row))}
                  {visibleEvents.length === 0 && (
                    <div className="absolute inset-0" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const isEmpty = resourceRows.length === 0 && !loading;

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekStart((w) => subWeeks(w, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            I dag
          </Button>
          <Button variant="outline" size="icon" onClick={() => setWeekStart((w) => addWeeks(w, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="text-sm font-medium text-muted-foreground">
          Uke {weekNumber}, {format(weekStart, "yyyy")} — {format(weekStart, "d. MMM", { locale: nb })} – {format(weekEnd, "d. MMM", { locale: nb })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-primary/80 inline-block" /> Oppdrag</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-orange-500/80 inline-block" /> Vedlikehold</span>
      </div>

      {/* Day headers */}
      <div className="flex mb-2">
        <div className="w-28 sm:w-36 flex-shrink-0" />
        <div className="flex-1 flex">
          {daysOfWeek.map((day, i) => (
            <div
              key={i}
              className={cn(
                "flex-1 text-center text-xs font-medium py-1",
                isSameDay(day, new Date()) ? "text-primary font-bold" : "text-muted-foreground"
              )}
            >
              {isMobile ? format(day, "EEEEE", { locale: nb }) : format(day, "EEE d.", { locale: nb })}
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          Laster ressurskalender…
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p className="text-sm">Ingen ressurser med hendelser</p>
          <p className="text-xs mt-1">Opprett oppdrag og tildel droner, utstyr eller personell for å se dem her</p>
        </div>
      ) : (
        <>
          {renderSection("Droner", <Plane className="w-4 h-4 text-primary" />, droneResources)}
          {renderSection("Personell", <Users className="w-4 h-4 text-blue-500" />, personnelResources)}
          {renderSection("Utstyr", <Wrench className="w-4 h-4 text-orange-500" />, equipmentResources)}
        </>
      )}

      <MissionDetailDialog
        open={missionDetailOpen}
        onOpenChange={setMissionDetailOpen}
        mission={selectedMission}
      />
    </div>
  );
}
