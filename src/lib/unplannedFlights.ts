// Shared definition of an "unplanned" flight: a flight log imported automatically
// (DJI / ArduPilot) where the flight was never planned in Avisafe beforehand.
//
// A linked mission alone is not proof of planning — a mission is usually created
// while processing the log. The mission must have existed BEFORE the flight started.

export const IMPORTED_SOURCES = ["dronelogapi", "dji", "dronelog", "ardupilot"];

/** Default slack (minutes) allowing a mission created just around take-off to count as planned. */
export const UNPLANNED_TOLERANCE_MINUTES = 15;

export interface UnplannedFlightLog {
  id?: string;
  source?: string | null;
  mission_id?: string | null;
  flight_date?: string | null;
  start_time_utc?: string | null;
  /** Embedded mission row from `missions(opprettet_dato)`, or a plain value. */
  missions?: { opprettet_dato?: string | null } | null;
  mission_created_at?: string | null;
}

/** True when the log comes from an automatic import (DJI or ArduPilot). */
export const isImportedFlightLog = (log: UnplannedFlightLog): boolean => {
  const s = (log.source || "").trim().toLowerCase();
  if (!s || s === "manual") return false;
  return true;
};

const flightStart = (log: UnplannedFlightLog): Date | null => {
  const raw = log.start_time_utc || log.flight_date;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
};

const missionCreatedAt = (log: UnplannedFlightLog): Date | null => {
  const raw = log.mission_created_at ?? log.missions?.opprettet_dato ?? null;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * True when the flight was not planned in advance:
 * no mission at all, or a mission created after the flight started (plus tolerance).
 */
export const isUnplannedFlight = (
  log: UnplannedFlightLog,
  toleranceMinutes: number = UNPLANNED_TOLERANCE_MINUTES,
): boolean => {
  if (!log.mission_id) return true;
  const created = missionCreatedAt(log);
  const start = flightStart(log);
  if (!created || !start) return false; // not enough data — do not flag
  return created.getTime() > start.getTime() + toleranceMinutes * 60_000;
};

export interface UnplannedSummary {
  total: number;
  unplanned: number;
  pct: number;
  byMonth: { month: string; planned: number; unplanned: number }[];
}

/**
 * Counts imported flights and how many of them were unplanned.
 * `monthKey` formats a log date into the bucket label used by the chart.
 */
export const summarizeUnplanned = (
  logs: UnplannedFlightLog[],
  monthKey?: (d: Date) => string,
  monthOrder?: string[],
): UnplannedSummary => {
  const imported = logs.filter(isImportedFlightLog);
  const buckets = new Map<string, { planned: number; unplanned: number }>();
  if (monthOrder) monthOrder.forEach(m => buckets.set(m, { planned: 0, unplanned: 0 }));

  let unplanned = 0;
  for (const log of imported) {
    const bad = isUnplannedFlight(log);
    if (bad) unplanned++;
    if (monthKey) {
      const d = flightStart(log);
      if (!d) continue;
      const key = monthKey(d);
      const bucket = buckets.get(key);
      if (!bucket) continue; // outside the selected period
      if (bad) bucket.unplanned++;
      else bucket.planned++;
    }
  }

  return {
    total: imported.length,
    unplanned,
    pct: imported.length ? (unplanned / imported.length) * 100 : 0,
    byMonth: [...buckets.entries()].map(([month, v]) => ({ month, ...v })),
  };
};
