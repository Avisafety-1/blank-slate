// Deterministic date and crew facts sent to the AI so it never has to guess them.

const OSLO = 'Europe/Oslo';

const osloParts = (d: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: OSLO, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
};

/** YYYY-MM-DD in Europe/Oslo. Date-only strings are returned unchanged. */
export const osloDateString = (input: Date | string | null | undefined): string | null => {
  if (input == null || input === '') return null;
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const p = osloParts(d);
  return `${p.y}-${p.m}-${p.d}`;
};

/** ISO timestamp with the Europe/Oslo offset, e.g. 2026-10-04T09:06:00+02:00. */
export const osloIsoWithOffset = (d: Date): string => {
  const p = osloParts(d);
  const asUtc = Date.UTC(+p.y, +p.m - 1, +p.d, +p.h, +p.mi, +p.s);
  const offsetMin = Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const oh = String(Math.floor(abs / 60)).padStart(2, '0');
  const om = String(abs % 60).padStart(2, '0');
  return `${p.y}-${p.m}-${p.d}T${p.h}:${p.mi}:${p.s}${sign}${oh}:${om}`;
};

/** Whole calendar days from currentDate (YYYY-MM-DD) to target in Europe/Oslo. Negative = overdue. */
export const daysUntilOslo = (currentDate: string, target: Date | string | null | undefined): number | null => {
  const t = osloDateString(target);
  if (!t) return null;
  const [cy, cm, cd] = currentDate.split('-').map(Number);
  const [ty, tm, td] = t.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(cy, cm - 1, cd)) / 86400000);
};

export interface MissionObservers { airspace: number; ground: number; total: number; m1cEligible: number }

/** Counts observers from mission personnel role names. */
export const countMissionObservers = (roleNames: Array<string | null | undefined>): MissionObservers => {
  const result = { airspace: 0, ground: 0, total: 0, m1cEligible: 0 };
  for (const raw of roleNames) {
    const name = String(raw ?? '');
    const isObserver = /observat|observer/i.test(name) || /\bVO\b/.test(name);
    if (!isObserver) continue;
    result.total++;
    if (/luftrom|airspace/i.test(name) || /\bVO\b/.test(name)) { result.airspace++; continue; }
    result.m1cEligible++;
    if (/bakke|ground/i.test(name)) result.ground++;
  }
  return result;
};

export const effectiveObserverCount = (pilotInputCount: unknown, missionObserverTotal: number): number => {
  const n = Number(pilotInputCount);
  const manual = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  return Math.max(manual, missionObserverTotal);
};

/** True when the role name counts as a pilot role. */
export const isPilotRoleName = (name: string | null | undefined): boolean =>
  /pilot|fjernpilot|rpic/i.test(String(name ?? ''));

/**
 * Filters mission personnel down to the rows that count as pilots:
 * a role matching pilot patterns, or no role at all (backwards compatible).
 */
export const filterPilots = <T,>(
  rows: Array<T | null | undefined>,
  roleName: (row: T) => string | null | undefined,
): T[] =>
  (rows || []).filter((row): row is T => {
    if (!row) return false;
    const role = roleName(row);
    if (role == null || role === '') return true;
    return isPilotRoleName(role);
  });
