/**
 * Shared popup HTML builder for unified airspace zones (DK/SE/DE/FI).
 * Reads name/short_name/theme + source-specific fields from `properties`
 * so users see human-readable info instead of raw enum codes.
 *
 * Used by both map layer rendering (`mapDataFetchers.ts`) and the
 * route-proximity auto-reveal (`unifiedRouteProximityLayers.ts`).
 */
import i18n from "@/i18n";

const tp = (k: string, opts?: any): string =>
  i18n.t(`pages.map.popups.unified.${k}`, opts) as string;

export const escUnified = (s: any): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );

export interface UnifiedZoneForPopup {
  id?: string;
  country_code?: string | null;
  source?: string | null;
  layer_id?: string | null;
  zone_type?: string | null;
  restriction_type?: string | null;
  theme?: string | null;
  name?: string | null;
  short_name?: string | null;
  lower_limit_m?: number | null;
  upper_limit_m?: number | null;
  lower_limit_raw?: string | null;
  upper_limit_raw?: string | null;
  altitude_reference?: string | null;
  authority?: string | null;
  properties?: Record<string, any> | null;
}

const RESTRICTION_STYLES: Record<
  string,
  { bg: string; fg: string; icon: string }
> = {
  PROHIBITED:        { bg: "#fee2e2", fg: "#991b1b", icon: "🚫" },
  RESTRICTED:        { bg: "#ffedd5", fg: "#9a3412", icon: "⚠️" },
  APPROVAL_REQUIRED: { bg: "#ffedd5", fg: "#9a3412", icon: "🛂" },
  NOTIFICATION:      { bg: "#dbeafe", fg: "#1e40af", icon: "📢" },
  CAUTION:           { bg: "#fef9c3", fg: "#854d0e", icon: "⚠️" },
  NATURE_SENSITIVE:  { bg: "#dcfce7", fg: "#166534", icon: "🌿" },
  INFO:              { bg: "#e0f2fe", fg: "#075985", icon: "ℹ️" },
};

/** LFV TYPEOFAREA → short template line describing typical drone rules. */
function lfvTemplateForType(typeOfArea: string | undefined): string | null {
  if (!typeOfArea) return null;
  const t = String(typeOfArea).toUpperCase();
  const key = ({
    "RW-5K": "lfv.template.RW5K",
    RW5K:   "lfv.template.RW5K",
    CTR:    "lfv.template.CTR",
    TIZ:    "lfv.template.TIZ",
    TIA:    "lfv.template.TIA",
    RMZ:    "lfv.template.RMZ",
    TMZ:    "lfv.template.TMZ",
    RSTA:   "lfv.template.R",
    R:      "lfv.template.R",
    DNGA:   "lfv.template.D",
    D:      "lfv.template.D",
    P:      "lfv.template.P",
  } as Record<string, string>)[t];
  if (!key) return null;
  const val = tp(key, { defaultValue: "" });
  return val || null;
}

function formatHeightRow(z: UnifiedZoneForPopup): string {
  const lowerRaw = z.lower_limit_raw?.trim();
  const upperRaw = z.upper_limit_raw?.trim();
  const hasRaw = lowerRaw || upperRaw;
  const hasM = z.lower_limit_m != null || z.upper_limit_m != null;
  if (!hasRaw && !hasM) return "";

  const lower = hasRaw
    ? lowerRaw || "GND"
    : z.lower_limit_m != null
      ? `${Math.round(z.lower_limit_m)} m`
      : "GND";
  const upper = hasRaw
    ? upperRaw || "UNL"
    : z.upper_limit_m != null
      ? `${Math.round(z.upper_limit_m)} m`
      : "UNL";
  const ref = z.altitude_reference ? ` ${escUnified(z.altitude_reference)}` : "";
  return `<div style="font-size:12px;margin-top:2px;color:#334155;">${escUnified(lower)} – ${escUnified(upper)}${ref}</div>`;
}

function formatDate(v: any): string {
  if (!v) return "";
  const s = String(v);
  // Trim ISO to YYYY-MM-DD
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

function naturvardsverketBlock(props: Record<string, any>): string {
  const parts: string[] = [];
  const kommun = props.KOMMUN as string | undefined;
  const lan = props.LAN as string | undefined;
  const loc = [lan, kommun].filter(Boolean).join(" · ");
  if (loc) parts.push(`<div>📍 ${escUnified(loc)}</div>`);

  const area = props.AREA_HA;
  if (area != null && !isNaN(Number(area))) {
    const n = Number(area);
    const fmt = n >= 100 ? n.toFixed(0) : n.toFixed(1);
    parts.push(`<div>${tp("area")}: ${escUnified(fmt)} ha</div>`);
  }

  const iucn = props.IUCNKATEGORI as string | undefined;
  if (iucn) {
    const short = iucn.split(",")[0].trim();
    parts.push(
      `<div title="${escUnified(iucn)}">IUCN: <strong>${escUnified(short)}</strong></div>`,
    );
  }

  const forv = props.FORVALTARE as string | undefined;
  if (forv) parts.push(`<div>${tp("managedBy")}: ${escUnified(forv)}</div>`);

  const date = formatDate(props.URSPR_BESLUTSDATUM || props.SENASTE_GALLANDEDATUM);
  if (date) parts.push(`<div>${tp("protectedSince")}: ${escUnified(date)}</div>`);

  const nvrid = props.NVRID;
  const linkUrl = nvrid
    ? `https://skyddadnatur.naturvardsverket.se/omrade/${encodeURIComponent(String(nvrid))}`
    : `https://skyddadnatur.naturvardsverket.se/`;
  parts.push(
    `<div style="margin-top:4px;"><a href="${escUnified(linkUrl)}" target="_blank" rel="noopener noreferrer">${tp("moreInfo")} →</a></div>`,
  );

  return parts.join("");
}

function lfvBlock(z: UnifiedZoneForPopup, props: Record<string, any>): string {
  const parts: string[] = [];
  const icao = props.POSITIONINDICATOR as string | undefined;
  const typeOfArea = (props.TYPEOFAREA as string | undefined) || z.zone_type || "";

  if (icao) {
    parts.push(
      `<div><span style="display:inline-block;padding:1px 6px;background:#e2e8f0;border-radius:4px;font-family:monospace;font-size:11px;">${escUnified(icao)}</span></div>`,
    );
  }

  const template = lfvTemplateForType(typeOfArea);
  if (template) {
    parts.push(
      `<div style="margin-top:4px;font-size:12px;color:#475569;">${escUnified(template)}</div>`,
    );
  }

  const wef = formatDate(props.WEF);
  if (wef) parts.push(`<div style="margin-top:4px;">${tp("validFrom")}: ${escUnified(wef)}</div>`);

  parts.push(
    `<div style="margin-top:4px;"><a href="https://daim.lfv.se/echarts/dronechart/" target="_blank" rel="noopener noreferrer">${tp("moreInfoLfv")} →</a></div>`,
  );

  return parts.join("");
}

function pansaBlock(z: UnifiedZoneForPopup, props: Record<string, any>): string {
  const parts: string[] = [];
  const restriction = String(props.pansa_restriction || "").toUpperCase().replace(/[-_\s]/g, "");
  const type_ = String(props.pansa_type || z.zone_type || "").toUpperCase();

  // DRA-P zones in Poland are flexible: only prohibited when activated (typically via NOTAM).
  if (restriction === "DRAP") {
    const title = tp("pansa.activatedByNotamTitle", { defaultValue: "Activated by NOTAM" });
    const body = tp("pansa.activatedByNotamBody", {
      defaultValue:
        "Flexible zone. Flight is only prohibited when the zone is active. Always check current NOTAM / DroneTower activity before flight.",
    });
    parts.push(
      `<div style="margin-bottom:6px;padding:6px 8px;background:#fef9c3;border-left:3px solid #ca8a04;border-radius:4px;font-size:12px;color:#713f12;"><strong>⚠️ ${escUnified(title)}</strong><div style="margin-top:2px;">${escUnified(body)}</div></div>`,
    );
  }

  const RESTRICTION_LABELS: Record<string, string> = {
    DRAP: "Drone Restricted Area – Prohibited (no flight)",
    DRAR: "Drone Restricted Area – Restricted (approval required)",
    DRAI: "Drone Restricted Area – Information (be aware)",
  };
  const label = RESTRICTION_LABELS[restriction];
  if (label) {
    parts.push(`<div style="font-size:12px;color:#475569;">${escUnified(label)}</div>`);
  }
  if (type_) {
    parts.push(
      `<div style="margin-top:4px;"><span style="display:inline-block;padding:1px 6px;background:#e2e8f0;border-radius:4px;font-family:monospace;font-size:11px;">${escUnified(type_)}</span></div>`,
    );
  }
  parts.push(
    `<div style="margin-top:4px;"><a href="https://dronemap.pansa.pl/" target="_blank" rel="noopener noreferrer">${tp("moreInfoPansa", { defaultValue: "More info on PANSA DroneMap" })} →</a></div>`,
  );
  return parts.join("");
}

function sourceLabel(z: UnifiedZoneForPopup): string {
  if (z.authority) return String(z.authority);
  const s = String(z.source || "");
  if (s.startsWith("naturvardsverket")) return "Naturvårdsverket";
  if (s.startsWith("lfv")) return "LFV";
  if (s.startsWith("trafikstyrelsen") || s.startsWith("dk_")) return "Trafikstyrelsen (DK)";
  if (s.startsWith("traficom") || s.startsWith("fi_")) return "Traficom (FI)";
  if (s.startsWith("dfs") || s.startsWith("de_")) return "DFS (DE)";
  if (s.startsWith("pansa") || s.startsWith("pl_")) return "PANSA (PL)";
  return s || "—";
}

/**
 * Build a human-readable popup HTML for a unified airspace zone.
 * Consistent visual across map layer rendering and route auto-reveal.
 */
export function buildUnifiedZonePopupHtml(
  z: UnifiedZoneForPopup,
  opts: { extraBadgeHtml?: string } = {},
): string {
  const restriction = String(z.restriction_type || "INFO").toUpperCase();
  const style = RESTRICTION_STYLES[restriction] || RESTRICTION_STYLES.INFO;
  const restrictionLabel = tp(`restriction.${restriction}`, {
    defaultValue: restriction,
  });

  const name = z.name || z.short_name || z.theme || tp("unknownZone", { defaultValue: "Ukjent sone" });
  const theme = z.theme && z.theme !== name ? z.theme : "";
  const shortName = z.short_name && z.short_name !== name && z.short_name !== theme ? z.short_name : "";
  const subtitle = [theme, shortName].filter(Boolean).join(" · ");

  const props = (z.properties || {}) as Record<string, any>;
  const src = String(z.source || "");
  let sourceBlock = "";
  if (src.startsWith("naturvardsverket")) sourceBlock = naturvardsverketBlock(props);
  else if (src.startsWith("lfv")) sourceBlock = lfvBlock(z, props);
  else if (src.startsWith("pansa")) sourceBlock = pansaBlock(z, props);

  const heightRow = formatHeightRow(z);
  const source = sourceLabel(z);
  const country = z.country_code ? ` · ${escUnified(z.country_code)}` : "";

  const badge = `<span style="display:inline-block;margin-top:4px;padding:2px 8px;background:${style.bg};color:${style.fg};border-radius:10px;font-size:11px;font-weight:600;">${style.icon} ${escUnified(restrictionLabel)}</span>`;

  return `
<div style="min-width:220px;max-width:300px;">
  <strong style="font-size:14px;">${escUnified(name)}</strong>
  ${subtitle ? `<div style="font-size:12px;color:#64748b;margin-top:1px;">${escUnified(subtitle)}</div>` : ""}
  ${badge}
  ${heightRow}
  ${sourceBlock ? `<div style="margin-top:6px;font-size:12px;color:#334155;">${sourceBlock}</div>` : ""}
  ${opts.extraBadgeHtml || ""}
  <div style="margin-top:6px;font-size:11px;color:#94a3b8;">${tp("source")}: ${escUnified(source)}${country}</div>
</div>`.trim();
}
