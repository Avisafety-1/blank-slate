/**
 * Felles popup-renderer for luftrom-trafikk på kartet.
 */
import i18n from '@/i18n';
const tp = (k: string, opts?: any): string => i18n.t(`pages.map.popups.traffic.${k}`, opts) as string;

export type TrafficSource =
  | { kind: "safesky"; subSource?: string | null } // f.eks. "flarm", "ogn", "adsb"
  | { kind: "avisafe-advisory" }                     // publisert via AviSafe → SafeSky
  | { kind: "avisafe-dronetag" }                     // live DroneTag-telemetri
  | { kind: "avisafe-flighthub2" }                   // live fra DJI FlightHub 2
  | { kind: "avisafe" };                              // generisk live AviSafe

export interface TrafficPopupData {
  callsign?: string | null;
  beaconType?: string | null;
  aircraftModel?: string | null;
  registration?: string | null;
  altitudeM?: number | null;
  groundSpeedMs?: number | null;
  verticalSpeedMs?: number | null;
  courseDeg?: number | null;
  squawk?: string | null;
  onGround?: boolean | null;
  updatedAt?: string | Date | null;
  source: TrafficSource;
}

const TYPE_LABELS: Record<string, string> = {
  UAV: "Drone",
  AIRCRAFT: "Fly",
  LIGHT_AIRCRAFT: "Lett fly",
  HEAVY_AIRCRAFT: "Tungt fly",
  HELICOPTER: "Helikopter",
  GLIDER: "Seilfly",
  PARAGLIDER: "Paraglider",
  HANG_GLIDER: "Hangglider",
  BALLOON: "Ballong",
  AIRSHIP: "Luftskip",
  SKYDIVER: "Fallskjermhopper",
  TOW_PLANE: "Slepefly",
  DOT: "Ukjent fartøy",
  UNKNOWN: "Ukjent",
};

export function formatBeaconType(t?: string | null): string {
  if (!t) return "Ukjent";
  const upper = t.toUpperCase();
  return TYPE_LABELS[upper] ?? t;
}

function formatSource(src: TrafficSource): string {
  switch (src.kind) {
    case "safesky":
      return src.subSource ? `SafeSky (${src.subSource})` : "SafeSky";
    case "avisafe-advisory":
      return "AviSafe → SafeSky";
    case "avisafe-dronetag":
      return "AviSafe (DroneTag)";
    case "avisafe-flighthub2":
      return "Live · DJI FlightHub 2";
    case "avisafe":
      return "AviSafe";
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function row(label: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const safe = typeof value === "string" ? escapeHtml(value) : String(value);
  return `<div style="display:flex;justify-content:space-between;gap:12px;line-height:1.35;">
    <span style="color:#6b7280;font-size:11px;">${escapeHtml(label)}</span>
    <span style="font-size:12px;font-weight:500;">${safe}</span>
  </div>`;
}

export function renderTrafficPopup(d: TrafficPopupData): string {
  const callsign = d.callsign?.trim() || "Ukjent";
  const typeLabel = d.beaconType ? formatBeaconType(d.beaconType) : null;

  const altM = d.altitudeM != null ? Math.round(d.altitudeM) : null;
  const altFt = d.altitudeM != null ? Math.round(d.altitudeM * 3.28084) : null;
  const altStr = altM != null ? `${altM} m (${altFt} ft)` : null;

  const speedKt = d.groundSpeedMs != null ? Math.round(d.groundSpeedMs * 1.94384) : null;
  const speedStr = speedKt != null
    ? `${speedKt} kt (${d.groundSpeedMs!.toFixed(1)} m/s)`
    : null;

  const vsStr = d.verticalSpeedMs != null && Math.abs(d.verticalSpeedMs) >= 0.2
    ? `${d.verticalSpeedMs > 0 ? "+" : ""}${d.verticalSpeedMs.toFixed(1)} m/s`
    : null;

  const courseStr = d.courseDeg != null ? `${Math.round(d.courseDeg)}°` : null;

  const statusStr = d.onGround === true
    ? "På bakken"
    : d.onGround === false
      ? "I luften"
      : null;

  let updatedStr: string | null = null;
  if (d.updatedAt) {
    const date = d.updatedAt instanceof Date ? d.updatedAt : new Date(d.updatedAt);
    if (!isNaN(date.getTime())) {
      updatedStr = date.toLocaleTimeString("no-NO");
    }
  }

  const rows = [
    row("Type", typeLabel),
    row("Modell", d.aircraftModel),
    row("Registrering", d.registration),
    row("Høyde", altStr),
    row("Fart", speedStr),
    row("Vertikalfart", vsStr),
    row("Kurs", courseStr),
    row("Squawk", d.squawk),
    row("Status", statusStr),
    row("Oppdatert", updatedStr),
  ].filter(Boolean).join("");

  return `
    <div style="min-width:200px;font-family:inherit;">
      <div style="font-weight:700;font-size:13px;margin-bottom:6px;">
        ${escapeHtml(callsign)}
      </div>
      ${rows}
      <div style="margin-top:8px;padding-top:6px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;gap:12px;">
        <span style="color:#6b7280;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;">Kilde</span>
        <span style="font-size:11px;font-weight:500;color:#374151;">${escapeHtml(formatSource(d.source))}</span>
      </div>
    </div>
  `;
}
