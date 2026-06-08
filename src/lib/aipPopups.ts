/**
 * Felles helpers for OpenAIP / AIP restriction zones (CTR, TIZ, TMA, P, R, D, RMZ, TMZ, ATZ).
 * Brukes av 3D-kartet for å rendre ekstruderte sylindere og bygge popups som speiler 2D.
 */

import { escapePopupHtml } from './zonePopups';

const esc = escapePopupHtml;

export interface AipZoneStyle {
  color: string;
  label: string;
  fillOpacity: number;
}

export const AIP_ZONE_STYLES: Record<string, AipZoneStyle> = {
  P:   { color: '#dc2626', label: 'Forbudsområde',                 fillOpacity: 0.20 },
  R:   { color: '#8b5cf6', label: 'Restriksjonsområde',            fillOpacity: 0.20 },
  D:   { color: '#f59e0b', label: 'Fareområde',                    fillOpacity: 0.20 },
  CTR: { color: '#ec4899', label: 'CTR (Control Zone)',            fillOpacity: 0.12 },
  TIZ: { color: '#a78bfa', label: 'TIZ (Traffic Information Zone)', fillOpacity: 0.12 },
  TMZ: { color: '#06b6d4', label: 'TMZ (Transponder Mandatory Zone)', fillOpacity: 0.12 },
  RMZ: { color: '#22c55e', label: 'RMZ (Radio Mandatory Zone)',    fillOpacity: 0.12 },
  ATZ: { color: '#f59e0b', label: 'Småflyplass — 5 km sone',       fillOpacity: 0.12 },
};

export const AIP_ZONE_TYPES = Object.keys(AIP_ZONE_STYLES);

/**
 * Parser AIP høyde-streng til meter AMSL/AGL (vi behandler dem likt for 3D-visuell).
 * Aksepterer: "GND", "SFC", "FL95", "1000 ft", "300 m", "1000 ft AGL", null.
 * Returnerer null hvis uparserbart.
 */
export function parseAipLimitToMeters(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim().toUpperCase();
  if (!s) return null;
  if (s === 'GND' || s === 'SFC' || s === '0' || s === 'GROUND' || s === 'SURFACE') return 0;
  if (s === 'UNL' || s === 'UNLIMITED') return 6000;

  // FL95 → 95 * 100 ft → meters
  const fl = s.match(/^FL\s*(\d+)/);
  if (fl) {
    const ft = parseInt(fl[1], 10) * 100;
    return Math.round(ft * 0.3048);
  }

  // "1000 ft", "1000FT AMSL", osv.
  const ft = s.match(/(\d+(?:\.\d+)?)\s*FT/);
  if (ft) return Math.round(parseFloat(ft[1]) * 0.3048);

  // "300 m", "300M"
  const m = s.match(/(\d+(?:\.\d+)?)\s*M\b/);
  if (m) return Math.round(parseFloat(m[1]));

  // Tall alene → anta meter
  const num = s.match(/^(\d+(?:\.\d+)?)$/);
  if (num) return Math.round(parseFloat(num[1]));

  return null;
}

export function buildAipZonePopupHtml(zone: any): string {
  const t = String(zone?.zone_type ?? '').toUpperCase();
  const style = AIP_ZONE_STYLES[t] || { color: '#dc2626', label: t || 'Luftrom', fillOpacity: 0.2 };
  const displayName = zone?.name || zone?.zone_id || 'Ukjent';
  let html = `<strong>${esc(style.label)}</strong><br/>`;
  html += `<strong>${esc(displayName)}</strong><br/>`;
  if (zone?.upper_limit) html += `Øvre grense: ${esc(zone.upper_limit)}<br/>`;
  if (zone?.lower_limit) html += `Nedre grense: ${esc(zone.lower_limit)}<br/>`;
  if (zone?.remarks) {
    html += `<div style="font-size:11px;margin-top:4px;color:#666;">${esc(zone.remarks)}</div>`;
  }
  return html;
}
