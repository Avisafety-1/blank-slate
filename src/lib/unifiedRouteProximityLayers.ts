/**
 * Auto-vis unified (DK/SE/DE/FI) luftrom- og naturområder langs den tegnede
 * ruten – uavhengig av om laget er huket av i lag-menyen. Speiler oppførselen
 * `updateRouteProximityLayers` gir i Norge.
 *
 * Gating:
 *   - `isUnifiedAirspaceEnabled()` (fail-closed, Moderavdeling-only)
 *   - `getUnifiedCountriesForRoute()` — kun land ruten faktisk berører
 *
 * Ingen effekt for Norge eller for selskaper utenfor allowlisten.
 */
import L from "leaflet";
import i18n from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import {
  getUnifiedCountriesForRoute,
  isUnifiedAirspaceEnabled,
} from "@/lib/airspaceUnified";
import type { RoutePoint } from "@/types/map";

const PANE = "routeProximityPane";
const BUFFER_M = 500;
const RPC_TIMEOUT_MS = 6_000;

const escapeHtml = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const autoBadge = () => {
  const label = i18n.t("safety.routeProximity.autoShownBadge") as string;
  return `<div style="margin-top:6px;padding:3px 6px;background:#fef3c7;color:#92400e;border-radius:4px;font-size:11px;display:inline-block;">${escapeHtml(label)}</div>`;
};

const UNIFIED_COLORS: Record<string, string> = {
  PROHIBITED: "#dc2626",
  RESTRICTED: "#f97316",
  NOTIFICATION: "#f59e0b",
  CAUTION: "#eab308",
  NATURE_SENSITIVE: "#16a34a",
  INFO: "#0ea5e9",
};

interface Bounds {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

function routeBounds(coords: RoutePoint[]): Bounds | null {
  const valid = coords.filter(
    (p) => isFinite(p.lat) && isFinite(p.lng) && !(p.lat === 0 && p.lng === 0),
  );
  if (valid.length < 2) return null;
  let minLat = valid[0].lat, maxLat = valid[0].lat;
  let minLng = valid[0].lng, maxLng = valid[0].lng;
  for (const p of valid) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  const centerLat = (minLat + maxLat) / 2;
  const latPad = BUFFER_M / 111_320;
  const lngPad = BUFFER_M / Math.max(1, 111_320 * Math.cos((centerLat * Math.PI) / 180));
  return {
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
    minLng: minLng - lngPad,
    maxLng: maxLng + lngPad,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

interface UnifiedZoneRow {
  id: string;
  country_code: string;
  zone_type: string | null;
  restriction_type: string | null;
  name: string | null;
  short_name: string | null;
  lower_limit_m: number | null;
  upper_limit_m: number | null;
  geometry_geojson: any;
}

interface DkNatureRow {
  name: string | null;
  theme: string | null;
  restriction_period: string | null;
  active: boolean;
  geometry: any;
}

function renderUnifiedZones(layer: L.LayerGroup, rows: UnifiedZoneRow[]) {
  for (const zone of rows) {
    if (!zone.geometry_geojson) continue;
    const restriction = String(zone.restriction_type || "INFO").toUpperCase();
    const color = UNIFIED_COLORS[restriction] || "#dc2626";
    const isNature = restriction === "NATURE_SENSITIVE";
    const name = zone.name || zone.short_name || zone.zone_type || "";
    const limits =
      zone.upper_limit_m != null || zone.lower_limit_m != null
        ? `<div style="font-size:11px;color:#64748b;">${escapeHtml(zone.lower_limit_m ?? "GND")} – ${escapeHtml(zone.upper_limit_m ?? "UNL")} m</div>`
        : "";
    const popup = `<div style="min-width:180px;"><strong>${isNature ? "🌿" : "⚠️"} ${escapeHtml(zone.zone_type || restriction)}</strong><br/><strong>${escapeHtml(name)}</strong> <span style="font-size:11px;color:#64748b;">(${escapeHtml(zone.country_code)})</span>${limits}${autoBadge()}</div>`;
    try {
      L.geoJSON(
        { type: "Feature", geometry: zone.geometry_geojson, properties: {} } as any,
        {
          pane: PANE,
          interactive: true,
          style: {
            color,
            weight: 2,
            fillColor: color,
            fillOpacity: isNature ? 0.18 : 0.22,
            dashArray: restriction === "CAUTION" ? "4, 4" : undefined,
          },
        },
      )
        .bindPopup(popup, { maxWidth: 320, autoPan: true })
        .addTo(layer);
    } catch { /* skip */ }
  }
}

function renderDkNature(layer: L.LayerGroup, rows: DkNatureRow[]) {
  for (const area of rows) {
    if (!area.geometry) continue;
    const active = area.active !== false;
    const color = active ? "#16a34a" : "#9ca3af";
    const name = area.name || "Ukjent";
    const theme = area.theme ? `<div>${escapeHtml(area.theme)}</div>` : "";
    const period = area.restriction_period ? `<div>${escapeHtml(area.restriction_period)}</div>` : "";
    const popup = `<div style="min-width:180px;"><strong>🌿 Naturområde (DK)${active ? "" : " — inaktiv"}</strong><br/><strong>${escapeHtml(name)}</strong>${theme}${period}${autoBadge()}</div>`;
    try {
      L.geoJSON(
        { type: "Feature", geometry: area.geometry, properties: {} } as any,
        {
          pane: PANE,
          interactive: true,
          style: {
            color,
            weight: 1.5,
            fillColor: color,
            fillOpacity: active ? 0.22 : 0.08,
            dashArray: active ? undefined : "5, 5",
          },
        },
      )
        .bindPopup(popup, { maxWidth: 320, autoPan: true })
        .addTo(layer);
    } catch { /* skip */ }
  }
}

export interface UnifiedProximityParams {
  layer: L.LayerGroup;
  coordinates: RoutePoint[];
  signal: AbortSignal;
  activeManualLayers?: {
    unifiedAirspace?: boolean;
    dkNature?: boolean;
  };
}

export async function updateUnifiedRouteProximityLayers(
  params: UnifiedProximityParams,
): Promise<void> {
  const { layer, coordinates, signal, activeManualLayers } = params;

  try { layer.clearLayers(); } catch { /* ignore */ }

  const bbox = routeBounds(coordinates);
  if (!bbox) return;
  if (signal.aborted) return;

  const countries = getUnifiedCountriesForRoute(coordinates, BUFFER_M);
  if (countries.length === 0) return;

  const enabled = await isUnifiedAirspaceEnabled();
  if (!enabled || signal.aborted) return;

  const wantUnified = !activeManualLayers?.unifiedAirspace;
  const wantDkNature = countries.includes("DK") && !activeManualLayers?.dkNature;

  const [unifiedRes, dkNatureRes] = await Promise.all([
    wantUnified
      ? withTimeout(
          Promise.resolve(
            supabase.rpc("airspace_zones_in_bbox", {
              p_min_lng: bbox.minLng,
              p_min_lat: bbox.minLat,
              p_max_lng: bbox.maxLng,
              p_max_lat: bbox.maxLat,
              p_zone_types: null,
              p_country_codes: countries,
              p_layer_ids: null,
            }),
          ),
          RPC_TIMEOUT_MS,
        ).catch(() => ({ data: [], error: null } as any))
      : Promise.resolve({ data: [], error: null } as any),
    wantDkNature
      ? withTimeout(
          Promise.resolve(
            supabase.rpc("get_dk_nature_areas_in_bounds", {
              min_lat: bbox.minLat,
              min_lng: bbox.minLng,
              max_lat: bbox.maxLat,
              max_lng: bbox.maxLng,
              p_include_inactive: true,
            }),
          ),
          RPC_TIMEOUT_MS,
        ).catch(() => ({ data: [], error: null } as any))
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (signal.aborted) return;

  const unifiedRows: UnifiedZoneRow[] = Array.isArray(unifiedRes?.data)
    ? (unifiedRes.data as UnifiedZoneRow[]).filter((r) => r?.geometry_geojson).slice(0, 800)
    : [];
  const dkNatureRows: DkNatureRow[] = Array.isArray(dkNatureRes?.data)
    ? (dkNatureRes.data as DkNatureRow[]).filter((r) => r?.geometry).slice(0, 300)
    : [];

  try { layer.clearLayers(); } catch { /* ignore */ }
  renderUnifiedZones(layer, unifiedRows);
  renderDkNature(layer, dkNatureRows);
}
