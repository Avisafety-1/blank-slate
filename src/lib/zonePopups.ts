/**
 * Shared popup HTML builders for CAA NO + DK drone zones.
 * Brukes av både 2D (Leaflet bindPopup) og 3D (MapLibre Popup.setHTML),
 * slik at info-boksene ser identiske ut på begge kart.
 */

export const escapePopupHtml = (s: any): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]!));

const esc = escapePopupHtml;

export interface CaaLayerStyleEntry {
  color: string;
  iconLabel: string;
}

export const CAA_LAYER_STYLES: Record<string, CaaLayerStyleEntry> = {
  fengsler:      { color: '#b91c1c', iconLabel: '🚫 Fengsel' },
  ambassader:    { color: '#b91c1c', iconLabel: '🚫 Ambassade' },
  fareomrader:   { color: '#eab308', iconLabel: '⚠️ Fareområde' },
  flyplasser:    { color: '#dc2626', iconLabel: '✈️ Flyplass' },
  notam_soner:   { color: '#eab308', iconLabel: '⚠️ NOTAM-sone' },
  restriksjoner: { color: '#dc2626', iconLabel: '🚫 Restriksjonsområde' },
};

export interface DkLayerStyleEntry {
  color: string;
  iconLabel: string;
  warningLevel: 'danger' | 'warning' | 'caution';
}

export const DK_LAYER_STYLES: Record<string, DkLayerStyleEntry> = {
  rod:    { color: '#dc2626', iconLabel: '🚫 Flyvesikringskritisk', warningLevel: 'danger' },
  orange: { color: '#f97316', iconLabel: '⚠️ Opmærksomhedsområde', warningLevel: 'warning' },
  bla:    { color: '#2563eb', iconLabel: '🛡️ Sikringskritisk',       warningLevel: 'caution' },
};

/** CAA NO drone-zone popup HTML — speiler eksisterende 2D-utseende 1:1. */
export function buildCaaZonePopupHtml(zone: any): string {
  const layerId = zone?.layer_id ?? '';
  const style = CAA_LAYER_STYLES[layerId] || { color: '#dc2626', iconLabel: '⚠️ Sone' };
  const p = zone || {};

  let html = `<strong>${style.iconLabel}</strong><br/>`;
  html += `<strong>${esc(p.name || 'Ukjent')}</strong><br/>`;
  if (p.message) {
    html += `<div style="margin-top:4px;max-width:280px">${esc(p.message)}</div>`;
  }
  if (p.lower_limit_m != null || p.upper_limit_m != null) {
    html += `<div style="margin-top:4px">Høyde: ${p.lower_limit_m ?? 'GND'}–${p.upper_limit_m ?? '?'} m ${esc(p.upper_ref || 'AGL')}</div>`;
  } else if (p.terrain_max_m != null) {
    html += `<div style="margin-top:4px">Høyde: ≈${Math.round(p.terrain_min_m ?? p.terrain_max_m)}–${Math.round(p.terrain_max_m + 120)} m MSL (terreng + 120 m)</div>`;
  }
  if (p.authority_name) {
    html += `<div style="margin-top:4px"><em>Myndighet:</em> ${esc(p.authority_name)}`;
    if (p.authority_url) {
      html += ` (<a href="${esc(p.authority_url)}" target="_blank" rel="noopener">info</a>)`;
    }
    html += `</div>`;
  }
  if (p.authority_phone) {
    html += `<div>Tlf: <a href="tel:${esc(p.authority_phone)}">${esc(p.authority_phone)}</a></div>`;
  }
  return html;
}

/** CAA "småflyplass — 5 km sone" popup (sirkel rundt fly-plasser). */
export function buildCaaSmallAirportPopupHtml(zone: any): string {
  const p = zone || {};
  let html = `<strong>✈️ Småflyplass — 5 km sone</strong><br/>`;
  html += `<strong>${esc(p.name || 'Ukjent')}</strong><br/>`;
  html += `<div style="margin-top:4px">Kontakt flyplassen før flyging — <a href="https://myppr.no" target="_blank" rel="noopener noreferrer">myppr.no</a></div>`;
  if (p.authority_phone) {
    html += `<div>Tlf: <a href="tel:${esc(p.authority_phone)}">${esc(p.authority_phone)}</a></div>`;
  }
  return html;
}

/** DK Trafikstyrelsen drone-zone popup HTML — speiler eksisterende 2D-utseende 1:1. */
export function buildDkZonePopupHtml(zone: any): string {
  const layerId = zone?.layer_id ?? '';
  const style = DK_LAYER_STYLES[layerId] || { color: '#dc2626', iconLabel: '⚠️ DK sone', warningLevel: 'danger' as const };
  let html = `<strong>${style.iconLabel}</strong><br/>`;
  html += `<strong>${esc(zone?.name || zone?.icao || 'Ukjent')}</strong>`;
  if (zone?.category) html += `<div>${esc(zone.category)}</div>`;
  if (zone?.buffer) html += `<div>Bufferzone: ${esc(zone.buffer)}</div>`;
  html += `<div style="margin-top:4px;font-size:11px;color:#666">Kilde: Trafikstyrelsen</div>`;
  return html;
}

/** DK / CAA layer-id => "caa" eller "dk" kilde (brukes i 3D popup-ruting). */
export function zoneSource(layerId: string | null | undefined): 'caa' | 'dk' | 'unknown' {
  if (!layerId) return 'unknown';
  if (layerId in CAA_LAYER_STYLES) return 'caa';
  if (layerId in DK_LAYER_STYLES) return 'dk';
  return 'unknown';
}

/**
 * Konservativ default-høyde (meter AGL) når upper_limit_m mangler i 3D-rendering.
 * Felles 120 m fallback — typisk drone-grense.
 */
export function defaultUpperLimitM(_layerId: string | null | undefined): number {
  return 120;
}
