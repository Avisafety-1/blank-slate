// Deno-port av statuslogikken for egendefinerte vedlikehold i
// src/lib/maintenanceSchedules.ts. Holdes i synk manuelt — endres reglene i
// UI-et må denne filen oppdateres tilsvarende.

import {
  calculateMaintenanceStatus,
  calculateUsageStatus,
  Status,
  worstStatus,
} from "./maintenanceStatus.ts";

export interface CustomSchedule {
  id: string;
  drone_id: string | null;
  equipment_id: string | null;
  navn: string | null;
  next_due_date: string | null;
  interval_hours: number | null;
  interval_missions: number | null;
  warn_days: number | null;
  warn_hours: number | null;
  warn_missions: number | null;
  hours_at_last: number | null;
  missions_at_last: number | null;
}

export interface CustomScheduleStatus {
  status: Status;
  reasons: string[];
}

export type ScheduleKind = "droner" | "utstyr";

const scheduleStatus = (
  s: CustomSchedule,
  totals: { totalHours: number; totalMissions: number },
): CustomScheduleStatus => {
  const name = s.navn || "Egendefinert vedlikehold";
  const reasons: string[] = [];

  const dateStatus = calculateMaintenanceStatus(s.next_due_date, s.warn_days ?? 14);
  if (dateStatus !== "Grønn") {
    reasons.push(
      `${name}: forfallsdato (${s.next_due_date ? String(s.next_due_date).slice(0, 10) : "ukjent"}) → ${dateStatus}`,
    );
  }

  const hoursUsed = Math.max(0, (totals.totalHours ?? 0) - (s.hours_at_last ?? 0));
  const hoursStatus = calculateUsageStatus(hoursUsed, s.interval_hours, s.warn_hours);
  if (hoursStatus !== "Grønn") {
    reasons.push(`${name}: timer siden sist (${hoursUsed.toFixed(1)}/${s.interval_hours}) → ${hoursStatus}`);
  }

  const missionsUsed = Math.max(0, (totals.totalMissions ?? 0) - (s.missions_at_last ?? 0));
  const missionsStatus = calculateUsageStatus(missionsUsed, s.interval_missions, s.warn_missions);
  if (missionsStatus !== "Grønn") {
    reasons.push(`${name}: oppdrag siden sist (${missionsUsed}/${s.interval_missions}) → ${missionsStatus}`);
  }

  const status = [dateStatus, hoursStatus, missionsStatus].reduce(
    (w, s2) => worstStatus(w, s2),
    "Grønn" as Status,
  );
  return { status, reasons };
};

/**
 * Henter alle egendefinerte vedlikehold for de gitte ressursene i én spørring
 * og returnerer verste status + årsaker per ressurs-id.
 * Feiler spørringen returneres et tomt map (vurderingen fortsetter uendret).
 */
export const fetchCustomScheduleStatuses = async (
  supabase: any,
  kind: ScheduleKind,
  resources: { id: string; totalHours: number }[],
): Promise<Record<string, CustomScheduleStatus>> => {
  const ids = resources.map((r) => r.id).filter(Boolean);
  if (ids.length === 0) return {};
  const column = kind === "droner" ? "drone_id" : "equipment_id";

  let schedules: CustomSchedule[] = [];
  try {
    const { data, error } = await supabase
      .from("maintenance_schedules")
      .select(
        "id, drone_id, equipment_id, navn, next_due_date, interval_hours, interval_missions, warn_days, warn_hours, warn_missions, hours_at_last, missions_at_last",
      )
      .in(column, ids);
    if (error) throw error;
    schedules = (data as CustomSchedule[]) || [];
  } catch (e) {
    console.error("Kunne ikke hente egendefinerte vedlikehold (fortsetter uten):", e);
    return {};
  }
  if (schedules.length === 0) return {};

  const byResource: Record<string, CustomSchedule[]> = {};
  for (const s of schedules) {
    const key = (kind === "droner" ? s.drone_id : s.equipment_id) as string | null;
    if (!key) continue;
    (byResource[key] ||= []).push(s);
  }

  // Oppdragstellinger hentes kun for ressurser med oppdragsintervall
  const needMissions = Object.keys(byResource).filter((id) =>
    byResource[id].some((s) => (s.interval_missions ?? 0) > 0)
  );
  const missionTotals: Record<string, number> = {};
  if (needMissions.length > 0) {
    try {
      const sets: Record<string, Set<string>> = {};
      if (kind === "droner") {
        const { data } = await supabase
          .from("flight_logs")
          .select("drone_id, mission_id")
          .in("drone_id", needMissions);
        for (const r of (data as any[]) || []) {
          if (!r.drone_id || !r.mission_id) continue;
          (sets[r.drone_id] ||= new Set()).add(r.mission_id);
        }
      } else {
        const { data } = await supabase
          .from("mission_equipment")
          .select("equipment_id, mission_id")
          .in("equipment_id", needMissions);
        for (const r of (data as any[]) || []) {
          if (!r.equipment_id || !r.mission_id) continue;
          (sets[r.equipment_id] ||= new Set()).add(r.mission_id);
        }
      }
      for (const [id, set] of Object.entries(sets)) missionTotals[id] = set.size;
    } catch (e) {
      console.error("Kunne ikke hente oppdragstellinger for egendefinerte vedlikehold:", e);
    }
  }

  const result: Record<string, CustomScheduleStatus> = {};
  for (const res of resources) {
    const list = byResource[res.id];
    if (!list || list.length === 0) continue;
    const totals = { totalHours: res.totalHours ?? 0, totalMissions: missionTotals[res.id] ?? 0 };
    let worst: Status = "Grønn";
    const reasons: string[] = [];
    for (const s of list) {
      const r = scheduleStatus(s, totals);
      worst = worstStatus(worst, r.status);
      reasons.push(...r.reasons);
    }
    result[res.id] = { status: worst, reasons };
  }
  return result;
};
