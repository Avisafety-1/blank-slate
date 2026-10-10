// Pure matching of unlinked flight logs to completed missions without a log (no I/O).
import { parseFlightDate, pickBestMission } from "../../../../lib/droneLogMatching";
import type { PossibleFlightLog } from "../types";

export interface UnlinkedLog {
  id: string;
  flight_date: string | null;
  start_time_utc?: string | null;
  drone_id: string | null;
  user_id: string | null;
  flight_duration_minutes: number | null;
  droneName?: string | null;
  pilotIds?: string[];
}

export interface MissionForMatch {
  id: string;
  tidspunkt: string;
  droneIds: string[];
  pilotIds: string[];
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Day of a flight log: a plain date string is used as-is (no timezone shift). */
const logDay = (l: UnlinkedLog): { key: string; start: Date } | null => {
  if (l.start_time_utc) {
    const d = parseFlightDate(l.start_time_utc);
    if (d) return { key: dayKey(d), start: d };
  }
  if (l.flight_date && /^\d{4}-\d{2}-\d{2}$/.test(l.flight_date)) {
    return { key: l.flight_date, start: new Date(`${l.flight_date}T12:00:00`) };
  }
  const d = parseFlightDate(l.flight_date);
  return d ? { key: dayKey(d), start: d } : null;
};

/**
 * For each unlinked log, find same-day missions with the same drone or pilot and
 * pick the best one (drone match first, then closest in time). One log per mission.
 */
export function matchPossibleLogs(
  missions: MissionForMatch[],
  logs: UnlinkedLog[],
): Map<string, PossibleFlightLog> {
  const byDay = new Map<string, MissionForMatch[]>();
  for (const m of missions) {
    const d = new Date(m.tidspunkt);
    if (isNaN(d.getTime())) continue;
    const k = dayKey(d);
    byDay.set(k, [...(byDay.get(k) ?? []), m]);
  }
  const droneMap: Record<string, string[]> = {};
  for (const m of missions) droneMap[m.id] = m.droneIds;

  const out = new Map<string, PossibleFlightLog>();
  for (const l of logs) {
    const day = logDay(l);
    if (!day) continue;
    const pilots = new Set([...(l.pilotIds ?? []), ...(l.user_id ? [l.user_id] : [])]);
    const candidates = (byDay.get(day.key) ?? []).filter(
      (m) => (l.drone_id && m.droneIds.includes(l.drone_id)) || m.pilotIds.some((p) => pilots.has(p)),
    );
    if (!candidates.length) continue;
    const { bestId } = pickBestMission(candidates, droneMap, l.drone_id, day.start);
    if (!bestId || out.has(bestId)) continue;
    out.set(bestId, {
      id: l.id,
      date: l.start_time_utc || l.flight_date,
      drone: l.droneName ?? null,
      minutes: l.flight_duration_minutes,
    });
  }
  return out;
}
