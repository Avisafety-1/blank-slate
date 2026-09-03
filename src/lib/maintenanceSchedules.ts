import { supabase } from "@/integrations/supabase/client";
import { Status } from "@/types";
import { calculateMaintenanceStatus, calculateUsageStatus, worstStatus } from "@/lib/maintenanceStatus";

export interface MaintenanceSchedule {
  id: string;
  company_id: string;
  drone_id: string | null;
  equipment_id: string | null;
  navn: string;
  sjekkliste_id: string | null;
  start_date: string | null;
  interval_days: number | null;
  interval_hours: number | null;
  interval_missions: number | null;
  warn_days: number | null;
  warn_hours: number | null;
  warn_missions: number | null;
  last_performed_at: string | null;
  next_due_date: string | null;
  hours_at_last: number | null;
  missions_at_last: number | null;
  email_alerts_enabled: boolean;
}

export interface MaintenanceSchedulePreset {
  id: string;
  company_id: string;
  navn: string;
  interval_days: number | null;
  interval_hours: number | null;
  interval_missions: number | null;
  warn_days: number | null;
  warn_hours: number | null;
  warn_missions: number | null;
  email_alerts_enabled: boolean;
}

export type ScheduleKind = "droner" | "utstyr";

export async function fetchSchedulesForResources(
  kind: ScheduleKind,
  resourceIds: string[]
): Promise<Record<string, MaintenanceSchedule[]>> {
  if (resourceIds.length === 0) return {};
  const column = kind === "droner" ? "drone_id" : "equipment_id";
  const { data, error } = await (supabase as any)
    .from("maintenance_schedules")
    .select("*")
    .in(column, resourceIds)
    .order("navn", { ascending: true });
  if (error) throw error;
  const map: Record<string, MaintenanceSchedule[]> = {};
  (data || []).forEach((s: MaintenanceSchedule) => {
    const key = (kind === "droner" ? s.drone_id : s.equipment_id) as string;
    if (!key) return;
    (map[key] ||= []).push(s);
  });
  return map;
}

export async function fetchSchedulePresets(companyId: string): Promise<MaintenanceSchedulePreset[]> {
  const { data, error } = await (supabase as any)
    .from("maintenance_schedule_presets")
    .select("*")
    .eq("company_id", companyId)
    .order("navn", { ascending: true });
  if (error) throw error;
  return (data || []) as MaintenanceSchedulePreset[];
}

export interface ScheduleProgress {
  hoursUsed: number;
  missionsUsed: number;
  status: Status;
}

export function calculateScheduleProgress(
  schedule: MaintenanceSchedule,
  totals: { totalHours: number; totalMissions: number }
): ScheduleProgress {
  const hoursUsed = Math.max(0, (totals.totalHours ?? 0) - (schedule.hours_at_last ?? 0));
  const missionsUsed = Math.max(0, (totals.totalMissions ?? 0) - (schedule.missions_at_last ?? 0));
  const dateStatus = calculateMaintenanceStatus(schedule.next_due_date, schedule.warn_days ?? 14);
  const hoursStatus = calculateUsageStatus(hoursUsed, schedule.interval_hours, schedule.warn_hours);
  const missionsStatus = calculateUsageStatus(missionsUsed, schedule.interval_missions, schedule.warn_missions);
  const status = [dateStatus, hoursStatus, missionsStatus].reduce(
    (w, s) => worstStatus(w, s),
    "Grønn" as Status
  );
  return { hoursUsed, missionsUsed, status };
}

/** Days until the schedule is due; null when no date is configured. */
export function scheduleDaysLeft(schedule: MaintenanceSchedule): number | null {
  if (!schedule.next_due_date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = new Date(schedule.next_due_date);
  next.setHours(0, 0, 0, 0);
  return Math.floor((next.getTime() - today.getTime()) / 86400000);
}

export function nextDueFromInterval(intervalDays: number | null | undefined): string | null {
  if (!intervalDays) return null;
  const d = new Date();
  d.setDate(d.getDate() + intervalDays);
  return d.toISOString();
}

/**
 * Marks a custom maintenance schedule as performed and writes a logbook entry
 * for the linked resource. Does not touch the resource's standard inspection fields.
 */
export async function performSchedule(params: {
  schedule: MaintenanceSchedule;
  kind: ScheduleKind;
  userId: string;
  totalHours: number;
  totalMissions: number;
  notes?: string;
  reset?: boolean;
}): Promise<void> {
  const { schedule, kind, userId, totalHours, totalMissions, notes = "", reset = false } = params;
  const now = new Date().toISOString();

  const update: Record<string, any> = {
    next_due_date: nextDueFromInterval(schedule.interval_days),
    hours_at_last: totalHours,
    missions_at_last: totalMissions,
    notification_sent: false,
  };
  if (!reset) update.last_performed_at = now;

  const { error } = await (supabase as any)
    .from("maintenance_schedules")
    .update(update)
    .eq("id", schedule.id);
  if (error) throw error;

  if (reset) return;

  const today = now.split("T")[0];
  if (kind === "droner" && schedule.drone_id) {
    await (supabase as any).from("drone_log_entries").insert({
      drone_id: schedule.drone_id,
      company_id: schedule.company_id,
      user_id: userId,
      entry_date: today,
      entry_type: "vedlikehold",
      title: schedule.navn,
      description: notes || schedule.navn,
    });
    await (supabase as any).from("drone_inspections").insert({
      drone_id: schedule.drone_id,
      company_id: schedule.company_id,
      user_id: userId,
      inspection_date: now,
      inspection_type: schedule.navn,
      notes,
      schedule_id: schedule.id,
    });
  } else if (kind === "utstyr" && schedule.equipment_id) {
    await (supabase as any).from("equipment_log_entries").insert({
      equipment_id: schedule.equipment_id,
      company_id: schedule.company_id,
      user_id: userId,
      entry_date: today,
      entry_type: "vedlikehold",
      title: schedule.navn,
      description: notes || schedule.navn,
    });
  }
}

/**
 * Computes the worst status across all custom maintenance schedules for the
 * given resources, so extra maintenance affects resource cards and dashboard KPIs.
 * Returns a map resourceId -> Status (only entries with schedules).
 */
export async function fetchScheduleStatusMap(
  kind: ScheduleKind,
  resources: { id: string; totalHours: number }[]
): Promise<Record<string, Status>> {
  const ids = resources.map((r) => r.id);
  if (ids.length === 0) return {};
  let byResource: Record<string, MaintenanceSchedule[]>;
  try {
    byResource = await fetchSchedulesForResources(kind, ids);
  } catch {
    return {};
  }
  const withSchedules = Object.keys(byResource);
  if (withSchedules.length === 0) return {};

  // Mission totals only needed for schedules using mission intervals
  const needMissions = withSchedules.filter((id) =>
    byResource[id].some((s) => (s.interval_missions ?? 0) > 0)
  );
  const missionTotals: Record<string, number> = {};
  if (needMissions.length > 0) {
    if (kind === "droner") {
      const { data } = await (supabase as any)
        .from("flight_logs")
        .select("drone_id, mission_id")
        .in("drone_id", needMissions);
      const sets: Record<string, Set<string>> = {};
      (data || []).forEach((r: any) => {
        if (!r.drone_id || !r.mission_id) return;
        (sets[r.drone_id] ||= new Set()).add(r.mission_id);
      });
      Object.entries(sets).forEach(([id, set]) => (missionTotals[id] = set.size));
    } else {
      const { data } = await (supabase as any)
        .from("mission_equipment")
        .select("equipment_id, mission_id")
        .in("equipment_id", needMissions);
      const sets: Record<string, Set<string>> = {};
      (data || []).forEach((r: any) => {
        if (!r.equipment_id || !r.mission_id) return;
        (sets[r.equipment_id] ||= new Set()).add(r.mission_id);
      });
      Object.entries(sets).forEach(([id, set]) => (missionTotals[id] = set.size));
    }
  }

  const result: Record<string, Status> = {};
  resources.forEach((res) => {
    const schedules = byResource[res.id];
    if (!schedules || schedules.length === 0) return;
    const totals = { totalHours: res.totalHours ?? 0, totalMissions: missionTotals[res.id] ?? 0 };
    result[res.id] = schedules.reduce(
      (worst, s) => worstStatus(worst, calculateScheduleProgress(s, totals).status),
      "Grønn" as Status
    );
  });
  return result;
}
