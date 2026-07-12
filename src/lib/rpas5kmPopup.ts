/**
 * Bygger HTML for popup som vises når brukeren klikker på en RPAS 5km-sone.
 */
import i18n from '@/i18n';
const tp = (k: string, opts?: any): string => i18n.t(`pages.map.popups.${k}`, opts) as string;

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatText(value: unknown): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br/>");
}

function pick(props: Record<string, any>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = props?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function buildRpas5kmPopupHtml(properties: Record<string, any> | null | undefined): string {
  const props = properties || {};
  const name = pick(props, "NAVN", "navn", "name", "NAME") || tp('rpas.fallbackName');
  const icao = pick(props, "ICAO", "icao");
  const ctrTiz = pick(props, "CTR_TIZ", "ctr_tiz");
  const sted = pick(props, "STED", "sted");

  // Beskrivelse / godkjenningsprosess
  const textBlocks: string[] = [];
  for (const key of ["TEKST1", "TEKST2", "TEKST3", "TEKST4", "TEKST5", "TEKST6"]) {
    const v = pick(props, key);
    if (v) textBlocks.push(formatText(v));
  }

  // Kontaktinformasjon
  const kontakt = pick(props, "KONTAKTDETALJER2", "KONTAKTDETALJER");

  // Header-chips
  const chips: string[] = [];
  if (icao) chips.push(escapeHtml(icao));
  if (ctrTiz) chips.push(escapeHtml(ctrTiz));
  if (sted && !chips.some((c) => c.toLowerCase() === sted.toLowerCase())) {
    chips.push(escapeHtml(sted));
  }

  const chipHtml = chips.length
    ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:2px;">${chips
        .map(
          (c) =>
            `<span style="font-size:10px;background:#fed7aa;color:#9a3412;padding:1px 6px;border-radius:4px;font-weight:600;">${c}</span>`,
        )
        .join("")}</div>`
    : "";

  const bodyHtml = textBlocks.length
    ? `<div style="margin-top:8px;font-size:12px;line-height:1.4;">${textBlocks
        .map((t) => `<div style="margin-bottom:6px;">${t}</div>`)
        .join("")}</div>`
    : "";

  const kontaktHtml = kontakt
    ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;">
         <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9a3412;margin-bottom:4px;">Kontakt</div>
         <div style="font-size:12px;line-height:1.4;">${formatText(kontakt)}</div>
       </div>`
    : "";

  const fallbackHtml = !textBlocks.length && !kontakt
    ? `<div style="margin-top:6px;font-size:12px;color:#6b7280;">
         For å fly innenfor 5 km fra lufthavner i Norge må operatøren ta kontakt før flyvning.
         Bruk <a href="https://myppr.no" target="_blank" rel="noopener noreferrer">myppr.no</a> for å sende forespørsel.
       </div>`
    : "";

  return `<div style="max-width:320px;max-height:380px;overflow-y:auto;">
    <div style="font-weight:700;font-size:13px;color:#7c2d12;">RPAS 5 km · ${escapeHtml(name)}</div>
    ${chipHtml}
    ${bodyHtml}
    ${fallbackHtml}
    ${kontaktHtml}
  </div>`;
}
