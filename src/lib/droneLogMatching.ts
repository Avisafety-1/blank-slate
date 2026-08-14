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
 * Returns all drones/equipment whose SN matches (exact matches first).
 * `preferredIds` acts as a tiebreaker (e.g. drones the pilot is linked to via drone_personnel).
 */
export const findSnMatches = <
  T extends { id?: string; serienummer?: string | null; internal_serial?: string | null },
>(
  list: T[],
  sn: string,
  preferredIds?: string[],
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
