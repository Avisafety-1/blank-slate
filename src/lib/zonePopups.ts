/**
 * Shared popup HTML builders for CAA NO + DK drone zones.
 * Brukes av både 2D (Leaflet bindPopup) og 3D (MapLibre Popup.setHTML),
 * slik at info-boksene ser identiske ut på begge kart.
 */
import i18n from '@/i18n';
const tp = (k: string, opts?: any) => i18n.t(`pages.map.popups.${k}`, opts);

export const escapePopupHtml = (s: any): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]!));

const esc = escapePopupHtml;

/**
 * Sanitizes CAA `message` text that may contain a small subset of HTML
 * (typically a single `<a href="...">Mer info</a>` link from dronesoner.no).
 *
 * Strategy: full-escape the whole string, then re-introduce only a strict
 * whitelist of tags via token substitution from the original raw string.
 * No external deps (DOMPurify is not in the project).
 *
 * Whitelist:
 *  - `<a href="http(s)://… | mailto:… | tel:…">text</a>` (other attrs stripped,
 *    target/rel forced to _blank/noopener noreferrer)
 *  - `<br>`, `<br/>`, `<br />`
 *  - `<strong>`, `<em>`, `<b>`, `<i>`, `<p>` (and closing tags)
 *
 * Newlines become `<br/>` so multi-line source content renders correctly.
 */
export function sanitizeCaaMessageHtml(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  const src = String(raw);
  if (!src) return '';

  const NUL = '\u0000';
  const tokens: string[] = [];
  const tokenize = (html: string) => {
    const i = tokens.length;
    tokens.push(html);
    return `${NUL}T${i}${NUL}`;
  };

  // Order matters: handle <a>…</a> first so its inner text isn't mis-tokenized.
  let working = src.replace(
    /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi,
    (_m, dq, sq, bare, inner) => {
      const href = String(dq ?? sq ?? bare ?? '').trim();
      if (!/^(https?:|mailto:|tel:)/i.test(href)) {
        // Drop the tag, keep inner text (will be escaped below).
        return inner;
      }
      const safeHref = esc(href);
      const safeText = esc(String(inner).replace(/<[^>]*>/g, ''));
      return tokenize(
        `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${safeText}</a>`,
      );
    },
  );

  // Standalone whitelisted tags
  working = working.replace(/<br\s*\/?\s*>/gi, () => tokenize('<br/>'));
  working = working.replace(
    /<\/?(?:strong|em|b|i|p)\s*>/gi,
    (m) => tokenize(m.toLowerCase().replace(/\s+/g, '')),
  );

  // Escape everything else
  let out = esc(working);

  // Convert raw newlines to <br/>
  out = out.replace(/\r\n|\r|\n/g, '<br/>');

  // Restore tokens
  out = out.replace(new RegExp(`${NUL}T(\\d+)${NUL}`, 'g'), (_m, i) => tokens[Number(i)] ?? '');

  return out;
}

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
    html += `<div style="margin-top:4px;max-width:280px;word-break:break-word">${sanitizeCaaMessageHtml(p.message)}</div>`;
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
