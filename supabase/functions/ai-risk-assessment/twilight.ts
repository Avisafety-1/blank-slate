// Civil twilight (sun at -6°) evaluated for the mission date in Europe/Oslo.
import { osloDateString } from './missionContext.ts';

export type TwilightWindow =
  | { kind: 'window'; dawn: Date; dusk: Date }
  | { kind: 'polar_night' }
  | { kind: 'midnight_sun' };

/** NOAA approximation for the given Oslo calendar date (YYYY-MM-DD). */
export const civilTwilightForDate = (osloDate: string, lat: number, lng: number): TwilightWindow => {
  const [y, m, d] = osloDate.split('-').map(Number);
  const base = Date.UTC(y, m - 1, d);
  const doy = Math.round((base - Date.UTC(y, 0, 0)) / 86400000);
  const DEG = Math.PI / 180;
  const gamma = ((2 * Math.PI) / 365) * (doy - 1);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.04089 * Math.sin(2 * gamma));
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const latRad = lat * DEG;
  const cosHA = (Math.cos(96 * DEG) - Math.sin(latRad) * Math.sin(decl)) / (Math.cos(latRad) * Math.cos(decl));
  if (cosHA > 1) return { kind: 'polar_night' };
  if (cosHA < -1) return { kind: 'midnight_sun' };
  const ha = Math.acos(cosHA) / DEG;
  const dawnMin = 720 - 4 * (lng + ha) - eqTime;
  const duskMin = 720 - 4 * (lng - ha) - eqTime;
  return { kind: 'window', dawn: new Date(base + dawnMin * 60000), dusk: new Date(base + duskMin * 60000) };
};

export interface TwilightEvaluation {
  info: { dawn: string; dusk: string } | null;
  violation: boolean;
  polarNight: boolean;
  noTimeSet: boolean;
  missionTime: string;
}

const fmt = (d: Date) => d.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' });

export const evaluateCivilTwilight = (p: {
  start: string | Date | null | undefined;
  end?: string | Date | null;
  lat: number;
  lng: number;
  now?: Date;
}): TwilightEvaluation => {
  const startDate = p.start ? new Date(p.start) : null;
  const osloDate = osloDateString(startDate ?? p.now ?? new Date())!;
  const win = civilTwilightForDate(osloDate, p.lat, p.lng);
  const result: TwilightEvaluation = { info: null, violation: false, polarNight: false, noTimeSet: !startDate, missionTime: '' };
  if (win.kind === 'polar_night') {
    result.polarNight = true;
    result.violation = true;
    return result;
  }
  if (win.kind === 'midnight_sun') return result;
  result.info = { dawn: fmt(win.dawn), dusk: fmt(win.dusk) };
  if (!startDate) return result;
  result.missionTime = fmt(startDate);
  const times = [startDate];
  const endDate = p.end ? new Date(p.end) : null;
  if (endDate && !Number.isNaN(endDate.getTime())) {
    times.push(endDate);
    result.missionTime += `–${fmt(endDate)}`;
  }
  result.violation = times.some((t) => t < win.dawn || t > win.dusk);
  return result;
};

export const POLAR_NIGHT_TEXT = {
  no: 'Ingen sivil skumring på denne datoen (polarnatt)',
  en: 'No civil twilight on this date (polar night)',
};
