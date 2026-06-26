import L from "leaflet";
import { supabase } from "@/integrations/supabase/client";
import { bufferPolyline } from "@/lib/soraGeometry";
import type { RoutePoint } from "@/types/map";

/**
 * Auto-vis kartlag-features langs den tegnede ruten.
 *
 * Trigges på rute-endring. Henter kun features innenfor en 500 m
 * bbox rundt ruten – uavhengig av om laget er aktivert i lag-menyen.
 * Re-evaluerer ved hver rute-endring, og tømmer ved kort rute.
 */

export const ROUTE_PROXIMITY_BUFFER_M = 500;
const PANE = "routeProximityPane";

interface BBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const AUTO_BADGE =
  '<div style="margin-top:6px;padding:3px 6px;background:#fef3c7;color:#92400e;border-radius:4px;font-size:11px;display:inline-block;">📍 Auto-vist langs ruten</div>';

const NATURVERN_COLORS: Record<string, string> = {
  Nasjonalpark: "#15803d",
  Naturreservat: "#166534",
  Landskapsvernområde: "#4ade80",
  Biotopvernområde: "#22c55e",
  "Marint verneområde": "#0ea5e9",
  Dyrefredningsområde: "#a3e635",
  Plantefredningsområde: "#84cc16",
};

const VERN_RESTRICTION_COLORS: Record<string, string> = {
  FERDSELSFORBUD: "#dc2626",
  LANDINGSFORBUD: "#f97316",
  LAVFLYVING: "#eab308",
};

const VERN_RESTRICTION_LABELS: Record<string, string> = {
  FERDSELSFORBUD: "Ferdselsforbud",
  LANDINGSFORBUD: "Landingsforbud",
  LAVFLYVING: "Lavflyvingsforbud under 300m",
};

const CAA_COLORS: Record<string, { color: string; label: string }> = {
  restriksjoner: { color: "#dc2626", label: "Restriksjonsområde" },
  fareomrader: { color: "#f59e0b", label: "Fareområde" },
  notam_soner: { color: "#a855f7", label: "NOTAM-sone" },
  flyplasser: { color: "#f59e0b", label: "Flyplass" },
  fengsler: { color: "#0284c7", label: "Fengsel" },
  ambassader: { color: "#0284c7", label: "Ambassade" },
};

const CAA_LAYER_IDS = [
  "restriksjoner",
  "fareomrader",
  "notam_soner",
  "flyplasser",
  "fengsler",
  "ambassader",
];

const NVE_BASE =
  "https://kart.nve.no/enterprise/rest/services/Nettanlegg4/MapServer";

interface KraftDef {
  layerId: number;
  label: string;
  color: string;
  weight: number;
  dashArray?: string;
  isPoint?: boolean;
}

const KRAFT_LAYERS: KraftDef[] = [
  { layerId: 0, label: "Transmisjonsnett", color: "#2563eb", weight: 3 },
  { layerId: 1, label: "Regionalnett", color: "#f97316", weight: 2 },
  { layerId: 3, label: "Sjøkabel", color: "#06b6d4", weight: 2, dashArray: "6, 4" },
  { layerId: 2, label: "Distribusjonsnett", color: "#eab308", weight: 1.5 },
  { layerId: 5, label: "Transformatorstasjon", color: "#a855f7", weight: 0, isPoint: true },
];

export function ensureRouteProximityPane(map: L.Map): void {
  if (!map.getPane(PANE)) {
    map.createPane(PANE);
    const pane = map.getPane(PANE);
    if (pane) {
      pane.style.zIndex = "637";
      pane.style.pointerEvents = "auto";
    }
  }
}

function computeRouteBbox(
  coordinates: RoutePoint[],
  bufferMeters: number,
): BBox | null {
  if (coordinates.length < 2) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of coordinates) {
    if (!isFinite(p.lat) || !isFinite(p.lng)) continue;
    if (p.lat === 0 && p.lng === 0) continue;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  if (!isFinite(minLat)) return null;
  // Inflate bbox by bufferMeters (approx)
  const midLat = (minLat + maxLat) / 2;
  const latPad = bufferMeters / 111320;
  const lngPad = bufferMeters / (111320 * Math.cos((midLat * Math.PI) / 180));
  return {
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
    minLng: minLng - lngPad,
    maxLng: maxLng + lngPad,
  };
}

function bboxKey(bbox: BBox): string {
  // Round to ~250m grid so small drags stay cached
  const r = (v: number) => Math.round(v * 400) / 400; // 1/400 deg ~ 250m lat
  return `${r(bbox.minLat)},${r(bbox.minLng)},${r(bbox.maxLat)},${r(bbox.maxLng)}`;
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    promise
      .then((v) => {
        clearTimeout(t);
        signal?.removeEventListener("abort", onAbort);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        signal?.removeEventListener("abort", onAbort);
        reject(e);
      });
  });
}

interface SourceCache {
  naturvern: Map<string, any[]>;
  vern: Map<string, any[]>;
  caa: Map<string, any[]>;
  nve: Map<string, Array<{ def: KraftDef; feature: any }>>;
}

export function createProximityCache(): SourceCache {
  return {
    naturvern: new Map(),
    vern: new Map(),
    caa: new Map(),
    nve: new Map(),
  };
}

async function loadNaturvern(bbox: BBox, cache: SourceCache): Promise<any[]> {
  const key = bboxKey(bbox);
  const hit = cache.naturvern.get(key);
  if (hit) return hit;
  const { data, error } = await supabase.rpc("get_naturvern_in_bounds", {
    min_lat: bbox.minLat,
    min_lng: bbox.minLng,
    max_lat: bbox.maxLat,
    max_lng: bbox.maxLng,
  });
  if (error || !data) return [];
  const list = (data as any[]).filter((z) => z?.geometry).slice(0, 500);
  cache.naturvern.set(key, list);
  return list;
}

async function loadVernRestrictions(
  bbox: BBox,
  cache: SourceCache,
): Promise<any[]> {
  const key = bboxKey(bbox);
  const hit = cache.vern.get(key);
  if (hit) return hit;
  const { data, error } = await supabase.rpc("get_vern_restrictions_in_bounds", {
    min_lat: bbox.minLat,
    min_lng: bbox.minLng,
    max_lat: bbox.maxLat,
    max_lng: bbox.maxLng,
  });
  if (error || !data) return [];
  const list = (data as any[]).filter((z) => z?.geometry).slice(0, 500);
  cache.vern.set(key, list);
  return list;
}

async function loadCaaZones(bbox: BBox, cache: SourceCache): Promise<any[]> {
  const key = bboxKey(bbox);
  const hit = cache.caa.get(key);
  if (hit) return hit;
  const { data, error } = await supabase.rpc("get_caa_zones_in_bounds", {
    min_lat: bbox.minLat,
    min_lng: bbox.minLng,
    max_lat: bbox.maxLat,
    max_lng: bbox.maxLng,
    p_layer_ids: CAA_LAYER_IDS,
  });
  if (error || !data) return [];
  const list = (data as any[]).filter((z) => z?.geometry).slice(0, 500);
  cache.caa.set(key, list);
  return list;
}

async function loadNvePowerLines(
  bbox: BBox,
  cache: SourceCache,
  signal: AbortSignal,
): Promise<Array<{ def: KraftDef; feature: any }>> {
  const key = bboxKey(bbox);
  const hit = cache.nve.get(key);
  if (hit) return hit;
  const envelope = `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`;
  const items: Array<{ def: KraftDef; feature: any }> = [];
  await Promise.all(
    KRAFT_LAYERS.map(async (def) => {
      try {
        const url = `${NVE_BASE}/${def.layerId}/query?where=1%3D1&geometry=${encodeURIComponent(
          envelope,
        )}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=4326&f=geojson&resultRecordCount=500`;
        const res = await fetch(url, { signal });
        if (!res.ok) return;
        const geojson = await res.json();
        if (!geojson?.features?.length) return;
        for (const f of geojson.features) items.push({ def, feature: f });
      } catch {
        /* ignore per-layer errors */
      }
    }),
  );
  cache.nve.set(key, items);
  return items;
}

// ============ Rendering helpers ============

function renderNaturvern(layer: L.LayerGroup, zones: any[]) {
  for (const zone of zones) {
    const color = NATURVERN_COLORS[zone.verneform || ""] || "#16a34a";
    const popup = `<div style="min-width:180px;"><strong>🌿 Naturvernområde</strong><br/><strong>${escapeHtml(
      zone.name || "Ukjent",
    )}</strong>${zone.verneform ? `<br/>Verneform: ${escapeHtml(zone.verneform)}` : ""}${AUTO_BADGE}</div>`;
    try {
      L.geoJSON(
        { type: "Feature", geometry: zone.geometry, properties: {} } as any,
        {
          pane: PANE,
          interactive: true,
          style: { color, weight: 2, fillColor: color, fillOpacity: 0.2 },
        },
      )
        .bindPopup(popup)
        .addTo(layer);
    } catch {
      /* skip broken geometry */
    }
  }
}

function renderVernRestrictions(layer: L.LayerGroup, zones: any[]) {
  for (const zone of zones) {
    const color = VERN_RESTRICTION_COLORS[zone.restriction_type || ""] || "#ef4444";
    const label = VERN_RESTRICTION_LABELS[zone.restriction_type || ""] || zone.restriction_type || "Restriksjon";
    const popup = `<div style="min-width:180px;"><strong>⛔ ${escapeHtml(label)}</strong><br/><strong>${escapeHtml(
      zone.name || "Ukjent",
    )}</strong>${AUTO_BADGE}</div>`;
    try {
      L.geoJSON(
        { type: "Feature", geometry: zone.geometry, properties: {} } as any,
        {
          pane: PANE,
          interactive: true,
          style: { color, weight: 2.5, fillColor: color, fillOpacity: 0.22, dashArray: "5, 5" },
        },
      )
        .bindPopup(popup)
        .addTo(layer);
    } catch {
      /* skip */
    }
  }
}

function renderCaaZones(layer: L.LayerGroup, zones: any[]) {
  for (const zone of zones) {
    const style = CAA_COLORS[zone.layer_id] || { color: "#dc2626", label: "CAA-sone" };
    const popup = `<div style="min-width:180px;"><strong>⚠️ ${escapeHtml(style.label)}</strong><br/><strong>${escapeHtml(
      zone.name || "Ukjent",
    )}</strong>${AUTO_BADGE}</div>`;
    try {
      L.geoJSON(
        { type: "Feature", geometry: zone.geometry, properties: {} } as any,
        {
          pane: PANE,
          interactive: true,
          style: {
            color: style.color,
            weight: 2,
            fillColor: style.color,
            fillOpacity: 0.18,
            dashArray: "4, 4",
          },
        },
      )
        .bindPopup(popup)
        .addTo(layer);
    } catch {
      /* skip */
    }
  }
}

function renderPowerLines(
  layer: L.LayerGroup,
  items: Array<{ def: KraftDef; feature: any }>,
) {
  for (const { def, feature } of items) {
    const p = feature?.properties || {};
    const name = p.NAVN || p.navn || p.Navn || p.name || "";
    const spenning = p.SPENNING || p.spenning || p.SPENNING_KV || "";
    const popup = `<div style="min-width:180px;"><strong>⚡ ${escapeHtml(def.label)}</strong>${
      name ? `<br/>${escapeHtml(name)}` : ""
    }${spenning ? `<br/>Spenning: ${escapeHtml(spenning)} kV` : ""}${AUTO_BADGE}</div>`;
    try {
      L.geoJSON(feature, {
        pane: PANE,
        interactive: true,
        style: def.isPoint
          ? undefined
          : {
              color: def.color,
              weight: def.weight,
              opacity: 0.95,
              dashArray: def.dashArray,
            },
        pointToLayer: def.isPoint
          ? (_f, latlng) =>
              L.circleMarker(latlng, {
                pane: PANE,
                radius: 5,
                fillColor: def.color,
                color: "#fff",
                weight: 1,
                fillOpacity: 0.9,
              })
          : undefined,
      })
        .bindPopup(popup)
        .addTo(layer);
    } catch {
      /* skip */
    }
  }
}

// ============ Public orchestrator ============

export interface UpdateProximityParams {
  map: L.Map;
  layer: L.LayerGroup;
  coordinates: RoutePoint[];
  signal: AbortSignal;
  cache: SourceCache;
  /** Lag som er aktivert manuelt — vi skipper for å unngå duplisering. */
  activeManualLayers?: {
    naturvern?: boolean;
    vern?: boolean;
    caa?: boolean;
    nve?: boolean;
  };
}

export async function updateRouteProximityLayers(
  params: UpdateProximityParams,
): Promise<void> {
  const { layer, coordinates, signal, cache, activeManualLayers } = params;

  const bbox = computeRouteBbox(coordinates, ROUTE_PROXIMITY_BUFFER_M);
  if (!bbox) {
    layer.clearLayers();
    return;
  }
  // Validate buffer polyline computation is sane (filter out 0,0 sentinels)
  const validCoords = coordinates.filter(
    (p) => isFinite(p.lat) && isFinite(p.lng) && !(p.lat === 0 && p.lng === 0),
  );
  if (validCoords.length < 2) {
    layer.clearLayers();
    return;
  }
  // Pre-compute buffer polygon (currently unused for additional filtering,
  // but kept so we can tighten later without changing the call site).
  bufferPolyline(validCoords, ROUTE_PROXIMITY_BUFFER_M);

  const [naturvern, vern, caa, nve] = await Promise.all([
    activeManualLayers?.naturvern
      ? Promise.resolve([] as any[])
      : withTimeout(loadNaturvern(bbox, cache), 5000, signal).catch(() => []),
    activeManualLayers?.vern
      ? Promise.resolve([] as any[])
      : withTimeout(loadVernRestrictions(bbox, cache), 5000, signal).catch(() => []),
    activeManualLayers?.caa
      ? Promise.resolve([] as any[])
      : withTimeout(loadCaaZones(bbox, cache), 5000, signal).catch(() => []),
    activeManualLayers?.nve
      ? Promise.resolve([] as Array<{ def: KraftDef; feature: any }>)
      : withTimeout(loadNvePowerLines(bbox, cache, signal), 5000, signal).catch(
          () => [] as Array<{ def: KraftDef; feature: any }>,
        ),
  ]);

  if (signal.aborted) return;

  layer.clearLayers();
  renderNaturvern(layer, naturvern);
  renderVernRestrictions(layer, vern);
  renderCaaZones(layer, caa);
  renderPowerLines(layer, nve);
}
