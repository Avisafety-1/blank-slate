// Shared matching helpers for drone flight logs (single upload + batch logging).
// Keeps SN matching and flight-date parsing identical across both code paths.

/** Match by exact OR prefix — handles old 16-char DJI SNs vs new full 20-char SNs. */
export const snMatchesDjiSn = (
  stored: string | null | undefined,
  parsedSn: string | null | undefined,
): boolean => {
  if (!stored || !parsedSn) return false;
  const s = stored.toLowerCase().trim();
  const p = parsedSn.toLowerCase().trim();
  if (!s || !p) return false;
  if (s === p) return true;
  if (s.length >= 12 && p.startsWith(s)) return true;
  if (p.length >= 12 && s.startsWith(p)) return true;
  return false;
};

/**
 * True only when the parsed log SN is MORE complete than the stored one
 * (DJI logs often expose a truncated 16-char SN — never overwrite a full 20-char SN with it).
 */
export const parsedSnIsMoreComplete = (
  stored: string | null | undefined,
  parsedSn: string | null | undefined,
): boolean => {
  const s = (stored || '').trim().toLowerCase();
  const p = (parsedSn || '').trim().toLowerCase();
  if (!p || s === p) return false;
  if (!s) return true;
  return p.length > s.length && p.startsWith(s);
};

/**
 * Compares the drone's stored name (as set in DJI Fly, e.g. "Rane") with the aircraft name
 * found in the log (e.g. "DJI Mini 5 Pro Rane"). Case-insensitive, whole-word containment.
 */
export const djiNameMatches = (
  storedName: string | null | undefined,
  logName: string | null | undefined,
): boolean => {
  const s = (storedName || '').trim().toLowerCase();
  const l = (logName || '').trim().toLowerCase();
  if (!s || !l || s.length < 2) return false;
  if (s === l) return true;
  const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\W)${escaped}(\\W|$)`).test(l);
};

/**
 * Returns all drones/equipment whose SN matches (exact matches first).
 * `logAircraftName` (the name from the DJI log) is used as the strongest tiebreaker when
 * several drones share a truncated SN prefix; `preferredIds` (e.g. drones the pilot is
 * linked to) is the fallback tiebreaker.
 */
export const findSnMatches = <
  T extends {
    id?: string;
    serienummer?: string | null;
    internal_serial?: string | null;
    dji_aircraft_name?: string | null;
  },
>(
  list: T[],
  sn: string,
  preferredIds?: string[],
  logAircraftName?: string | null,
): T[] => {
  const matches = list.filter(
    x => snMatchesDjiSn(x.serienummer, sn) || snMatchesDjiSn(x.internal_serial, sn),
  );
  const p = sn.trim().toLowerCase();
  const exact = matches.filter(
    x =>
      (x.serienummer || '').trim().toLowerCase() === p ||
      (x.internal_serial || '').trim().toLowerCase() === p,
  );
  const result = exact.length > 0 ? exact : matches;
  if (result.length > 1 && logAircraftName) {
    const byName = result.filter(x => djiNameMatches(x.dji_aircraft_name, logAircraftName));
    if (byName.length === 1) return byName;
    if (byName.length > 1) return byName;
  }
  if (result.length > 1 && preferredIds && preferredIds.length > 0) {
    const preferred = result.filter(x => x.id && preferredIds.includes(x.id));
    if (preferred.length > 0) return preferred;
  }
  return result;
};


/** Parses DJI/ArduPilot start times, including the US-style formats `new Date()` mishandles. */
export const parseFlightDate = (raw: string | null | undefined): Date | null => {
  if (!raw) return null;
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d;
  const m = raw.match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*T?\s*(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*(AM|PM)?/i,
  );
  if (m) {
    const [, month, day, year, hours, mins, secs, , ampm] = m;
    let h = parseInt(hours);
    if (ampm?.toUpperCase() === 'PM' && h < 12) h += 12;
    if (ampm?.toUpperCase() === 'AM' && h === 12) h = 0;
    const parsed = new Date(
      `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${String(h).padStart(2, '0')}:${mins}:${secs}Z`,
    );
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

/**
 * Picks the best mission for a flight log among same-day missions.
 * Rule: missions that have the log's drone linked win; among those (or among all,
 * when nothing matches on drone) the one closest in time to the flight start wins.
 * Returns the ordered list (drone matches first) plus the id to preselect.
 */
export const pickBestMission = <T extends { id: string; tidspunkt: string }>(
  missions: T[],
  missionDroneIds: Record<string, string[]>,
  droneId: string | null | undefined,
  flightStart: Date,
): { sorted: T[]; bestId: string | null; droneMatchIds: string[] } => {
  const byTime = [...missions].sort(
    (a, b) =>
      Math.abs(new Date(a.tidspunkt).getTime() - flightStart.getTime()) -
      Math.abs(new Date(b.tidspunkt).getTime() - flightStart.getTime()),
  );
  const droneMatchIds = droneId
    ? byTime.filter(m => (missionDroneIds[m.id] || []).includes(droneId)).map(m => m.id)
    : [];
  if (droneMatchIds.length === 0) {
    return { sorted: byTime, bestId: byTime[0]?.id ?? null, droneMatchIds };
  }
  const sorted = [
    ...byTime.filter(m => droneMatchIds.includes(m.id)),
    ...byTime.filter(m => !droneMatchIds.includes(m.id)),
  ];
  return { sorted, bestId: sorted[0].id, droneMatchIds };
};

/** Label for a drone in pickers: "Modell – Navn (SN)" — name only when set. */
export const droneOptionLabel = (d: { modell?: string | null; serienummer?: string | null; dji_aircraft_name?: string | null }) => {
  const name = (d.dji_aircraft_name || '').trim();
  const sn = (d.serienummer || '').trim();
  return `${d.modell || ''}${name ? ` – ${name}` : ''}${sn ? ` (${sn})` : ''}`;
};
