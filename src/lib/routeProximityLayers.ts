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

interface AisVessel {
  mmsi?: number | string;
  name?: string;
  lat: number;
  lon: number;
  cog?: number | null;
  sog?: number | null;
  shipType?: number | null;
  destination?: string | null;
}

interface AisCacheEntry {
  ts: number;
  vessels: AisVessel[];
}

const AIS_CACHE_TTL_MS = 30_000;

interface ObstacleRecord {
  openaip_id: string;
  name: string | null;
  type: string | null;
  elevation: number | null;
  height_agl: number | null;
  lat: number;
  lng: number;
}

interface SourceCache {
  naturvern: Map<string, any[]>;
  vern: Map<string, any[]>;
  caa: Map<string, any[]>;
  nve: Map<string, Array<{ def: KraftDef; feature: any }>>;
  ais: Map<string, AisCacheEntry>;
  obstacles: Map<string, ObstacleRecord[]>;
}

export function createProximityCache(): SourceCache {
  return {
    naturvern: new Map(),
    vern: new Map(),
    caa: new Map(),
    nve: new Map(),
    ais: new Map(),
    obstacles: new Map(),
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

// ============ AIS (BarentsWatch) ============

const SHIP_TYPE_NAMES: Record<number, string> = {
  30: "Fiskefartøy",
  31: "Sleping",
  32: "Sleping",
  33: "Mudring",
  34: "Dykking",
  35: "Militær",
  36: "Seilbåt",
  37: "Fritidsfartøy",
  40: "Hurtiggående fartøy",
  50: "Losfartøy",
  51: "SAR",
  52: "Taubåt",
  53: "Havneassistanse",
  55: "Politi",
  58: "Medisinsk",
  60: "Passasjerskip",
  70: "Lasteskip",
  80: "Tankskip",
};

function getShipTypeName(type: number | null | undefined): string {
  if (type == null) return "Ukjent";
  const base = Math.floor(type / 10) * 10;
  return SHIP_TYPE_NAMES[type] || SHIP_TYPE_NAMES[base] || `Type ${type}`;
}

function vesselColor(shipType: number | null | undefined): string {
  if (shipType == null) return "#2563eb";
  const base = Math.floor(shipType / 10) * 10;
  if (base === 30) return "#059669";
  if (base === 60) return "#7c3aed";
  if (base === 70) return "#d97706";
  if (base === 80) return "#dc2626";
  if (shipType === 35) return "#475569";
  if (shipType === 51 || shipType === 52) return "#ea580c";
  return "#2563eb";
}

function createVesselIcon(cog: number | null | undefined, shipType: number | null | undefined): L.DivIcon {
  const rotation = cog != null ? cog : 0;
  const color = vesselColor(shipType);
  return L.divIcon({
    className: "",
    html: `<div style="width:20px;height:20px;display:flex;align-items:center;justify-content:center;transform:rotate(${rotation}deg);">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="${color}" stroke="#fff" stroke-width="1">
        <path d="M12 2 L6 20 L12 16 L18 20 Z"/>
      </svg>
    </div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
  });
}

async function loadAisVessels(
  bbox: BBox,
  cache: SourceCache,
): Promise<AisVessel[]> {
  const key = bboxKey(bbox);
  const hit = cache.ais.get(key);
  const now = Date.now();
  if (hit && now - hit.ts < AIS_CACHE_TTL_MS) return hit.vessels;
  const { data, error } = await supabase.functions.invoke("barentswatch-ais", {
    body: {
      bounds: {
        minLat: bbox.minLat,
        minLng: bbox.minLng,
        maxLat: bbox.maxLat,
        maxLng: bbox.maxLng,
      },
    },
  });
  if (error) return [];
  const vessels = Array.isArray(data?.vessels) ? (data.vessels as AisVessel[]) : [];
  const valid = vessels.filter((v) => v && isFinite(v.lat) && isFinite(v.lon));
  cache.ais.set(key, { ts: now, vessels: valid });
  return valid;
}

// Ray-casting point-in-polygon for a ring expressed as RoutePoint[]
function pointInRing(lat: number, lng: number, ring: RoutePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng, yi = ring[i].lat;
    const xj = ring[j].lng, yj = ring[j].lat;
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function renderAisVessels(
  layer: L.LayerGroup,
  vessels: AisVessel[],
  buffer: RoutePoint[] | null,
) {
  for (const v of vessels) {
    if (buffer && !pointInRing(v.lat, v.lon, buffer)) continue;
    try {
      const marker = L.marker([v.lat, v.lon], {
        icon: createVesselIcon(v.cog, v.shipType),
        pane: PANE,
        interactive: true,
      });
      const typeName = getShipTypeName(v.shipType);
      const sog = v.sog != null ? `${v.sog.toFixed(1)} kn` : "–";
      const cog = v.cog != null ? `${Math.round(v.cog)}°` : "–";
      const name = escapeHtml(v.name || "Ukjent");
      let popup = `<div style="min-width:180px;"><strong>🚢 ${name}</strong><br/>`;
      popup += `MMSI: ${escapeHtml(v.mmsi ?? "–")}<br/>`;
      popup += `Type: ${escapeHtml(typeName)}<br/>`;
      popup += `Fart: ${sog}<br/>`;
      popup += `Kurs: ${cog}`;
      if (v.destination) popup += `<br/>Dest: ${escapeHtml(v.destination)}`;
      popup += AUTO_BADGE + `</div>`;
      marker.bindPopup(popup);
      marker.addTo(layer);
    } catch {
      /* skip */
    }
  }
}

// ============ Luftfartshindre (openaip_obstacles) ============

async function loadObstacles(cache: SourceCache): Promise<ObstacleRecord[]> {
  if (cache.obstaclesAll) return cache.obstaclesAll;
  if (cache.obstaclesPromise) return cache.obstaclesPromise;
  cache.obstaclesPromise = (async () => {
    const { data, error } = await supabase
      .from("openaip_obstacles")
      .select("openaip_id, name, type, geometry, elevation, height_agl");
    if (error || !data) return [];
    const records: ObstacleRecord[] = [];
    for (const o of data as any[]) {
      const geom = o.geometry as any;
      const coords = geom?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (!isFinite(lat) || !isFinite(lng)) continue;
      records.push({
        openaip_id: o.openaip_id,
        name: o.name ?? null,
        type: o.type ?? null,
        elevation: o.elevation ?? null,
        height_agl: o.height_agl ?? null,
        lat,
        lng,
      });
    }
    cache.obstaclesAll = records;
    return records;
  })();
  return cache.obstaclesPromise;
}

function renderObstacles(
  layer: L.LayerGroup,
  obstacles: ObstacleRecord[],
  bbox: BBox,
  buffer: RoutePoint[] | null,
) {
  const icon = L.divIcon({
    className: "",
    html: `<div style="width:20px;height:20px;display:flex;align-items:center;justify-content:center;">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#ef4444" stroke="#991b1b" stroke-width="1.5">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13" stroke="white" stroke-width="2"/>
        <line x1="12" y1="17" x2="12.01" y2="17" stroke="white" stroke-width="2"/>
      </svg>
    </div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
  });
  for (const o of obstacles) {
    if (o.lat < bbox.minLat || o.lat > bbox.maxLat || o.lng < bbox.minLng || o.lng > bbox.maxLng) continue;
    if (buffer && !pointInRing(o.lat, o.lng, buffer)) continue;
    try {
      const typeName = o.type || "Ukjent";
      const displayName = o.name || typeName;
      let popup = `<div style="min-width:180px;"><strong>⚠️ Hindring</strong><br/><strong>${escapeHtml(displayName)}</strong><br/>Type: ${escapeHtml(typeName)}<br/>`;
      if (o.elevation != null) popup += `Høyde (MSL): ${escapeHtml(o.elevation)} m<br/>`;
      if (o.height_agl != null) popup += `Høyde (AGL): ${escapeHtml(o.height_agl)} m<br/>`;
      popup += AUTO_BADGE + `</div>`;
      L.marker([o.lat, o.lng], { icon, pane: PANE, interactive: true })
        .bindPopup(popup)
        .addTo(layer);
    } catch {
      /* skip */
    }
  }
}

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
    ais?: boolean;
    obstacles?: boolean;
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
  // Buffer polygon used for precise 500 m filtering of point features
  const bufferPolygon = bufferPolyline(validCoords, ROUTE_PROXIMITY_BUFFER_M);

  const [naturvern, vern, caa, nve, ais, obstacles] = await Promise.all([
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
    activeManualLayers?.ais
      ? Promise.resolve([] as AisVessel[])
      : withTimeout(loadAisVessels(bbox, cache), 8000, signal).catch(
          () => [] as AisVessel[],
        ),
    activeManualLayers?.obstacles
      ? Promise.resolve([] as ObstacleRecord[])
      : withTimeout(loadObstacles(cache), 5000, signal).catch(
          () => [] as ObstacleRecord[],
        ),
  ]);

  if (signal.aborted) return;

  layer.clearLayers();
  renderNaturvern(layer, naturvern);
  renderVernRestrictions(layer, vern);
  renderCaaZones(layer, caa);
  renderPowerLines(layer, nve);
  renderAisVessels(layer, ais, bufferPolygon);
  renderObstacles(layer, obstacles, bbox, bufferPolygon);
}
