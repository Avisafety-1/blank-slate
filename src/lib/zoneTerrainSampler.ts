/**
 * Sampler terrenghøyde (MSL i meter) for sone-polygoner via eksisterende
 * `terrain-elevation` edge-funksjon. Returnerer { min, max, mean } per sone.
 *
 * Brukes av Map3D for å vise 3D-extrusion-soner som starter på bakkenivå
 * og — når øvre grense mangler — får topp = terrain_max + 120 m.
 *
 * - Cache i minnet per nøkkel (zone_id eller geometri-hash)
 * - Sampler 9 punkter per sone (centroid + 8 punkter i 3x3-grid innenfor bbox)
 *   → balansert mellom presisjon og antall API-kall
 * - Batcher alle prøver fra alle ukjente soner i ett edge-kall
 */

import { fetchTerrainElevations } from "./terrainElevation";

export interface TerrainSample {
  min: number;
  max: number;
  mean: number;
}

const SAMPLES_PER_ZONE = 9; // 3x3 grid

const cache = new Map<string, TerrainSample>();
const inFlight = new Map<string, Promise<TerrainSample | null>>();

/** Henter alle ringer (ytre + indre) som [lng, lat][] fra Polygon/MultiPolygon. */
function flattenCoords(geom: any): [number, number][] {
  if (!geom) return [];
  const out: [number, number][] = [];
  const walk = (arr: any) => {
    if (!Array.isArray(arr)) return;
    if (
      arr.length >= 2 &&
      typeof arr[0] === "number" &&
      typeof arr[1] === "number"
    ) {
      out.push([arr[0], arr[1]]);
      return;
    }
    for (const v of arr) walk(v);
  };
  walk(geom.coordinates);
  return out;
}

/** Returnerer 9 prøvepunkter (3x3-grid) innenfor sonens bbox. */
function samplePoints(geom: any): { lat: number; lng: number }[] {
  const coords = flattenCoords(geom);
  if (coords.length === 0) return [];

  let minLng = Infinity,
    maxLng = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return [];

  const pts: { lat: number; lng: number }[] = [];
  const steps = Math.sqrt(SAMPLES_PER_ZONE) | 0; // 3
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const fx = steps === 1 ? 0.5 : i / (steps - 1);
      const fy = steps === 1 ? 0.5 : j / (steps - 1);
      pts.push({
        lng: minLng + (maxLng - minLng) * fx,
        lat: minLat + (maxLat - minLat) * fy,
      });
    }
  }
  return pts;
}

/** Stabil nøkkel for en sone — bruker zone_id når tilgjengelig, ellers geometri-hash. */
export function zoneCacheKey(props: any, geom: any): string {
  if (props?.zone_id) return `id:${props.zone_id}`;
  if (props?.layer_id && props?.name) return `nm:${props.layer_id}:${props.name}`;
  // Fallback: kort hash av første koordinat
  const c = flattenCoords(geom)[0];
  return c ? `c:${c[0].toFixed(4)},${c[1].toFixed(4)}` : `r:${Math.random()}`;
}

/** Henter cachet sample for én sone (synkront). */
export function getCachedSample(key: string): TerrainSample | undefined {
  return cache.get(key);
}

/**
 * Sampler terreng for et sett av soner i ett samlet kall.
 * Returnerer Map<key, TerrainSample> for de som lyktes (og var nye/cachede).
 * Cachede prøver tas med i resultatet uten ekstra kall.
 */
export async function sampleZonesTerrain(
  zones: { key: string; geometry: any }[],
  signal?: AbortSignal
): Promise<Map<string, TerrainSample>> {
  const result = new Map<string, TerrainSample>();

  // Splitt i cached / pending / nye
  const need: { key: string; points: { lat: number; lng: number }[] }[] = [];
  const pendingKeys: string[] = [];

  for (const z of zones) {
    const cached = cache.get(z.key);
    if (cached) {
      result.set(z.key, cached);
      continue;
    }
    if (inFlight.has(z.key)) {
      pendingKeys.push(z.key);
      continue;
    }
    const points = samplePoints(z.geometry);
    if (points.length === 0) continue;
    need.push({ key: z.key, points });
  }

  // Vent på allerede pågående prøver
  if (pendingKeys.length > 0) {
    await Promise.all(
      pendingKeys.map(async (k) => {
        const p = inFlight.get(k);
        if (!p) return;
        const s = await p;
        if (s) result.set(k, s);
      })
    );
  }

  if (need.length === 0) return result;

  // Bygg én flat liste av posisjoner + indeks for å splitte tilbake
  const flat: { lat: number; lng: number }[] = [];
  const ranges: { key: string; start: number; end: number }[] = [];
  for (const n of need) {
    const start = flat.length;
    flat.push(...n.points);
    ranges.push({ key: n.key, start, end: flat.length });
  }

  // Registrer in-flight promiser så parallelle kall ikke dobler arbeidet
  let resolveBatch!: (samples: Map<string, TerrainSample>) => void;
  const batchPromise = new Promise<Map<string, TerrainSample>>((res) => {
    resolveBatch = res;
  });
  for (const r of ranges) {
    inFlight.set(
      r.key,
      batchPromise.then((m) => m.get(r.key) ?? null)
    );
  }

  let elevations: (number | null)[] = [];
  try {
    elevations = await fetchTerrainElevations(flat, signal);
  } catch (err) {
    console.warn("[zoneTerrainSampler] fetch failed", err);
  }

  const out = new Map<string, TerrainSample>();
  for (const r of ranges) {
    const slice = elevations.slice(r.start, r.end).filter(
      (v): v is number => typeof v === "number" && Number.isFinite(v)
    );
    if (slice.length === 0) continue;
    let mn = Infinity,
      mx = -Infinity,
      sum = 0;
    for (const v of slice) {
      if (v < mn) mn = v;
      if (v > mx) mx = v;
      sum += v;
    }
    const sample: TerrainSample = {
      min: Math.round(mn),
      max: Math.round(mx),
      mean: Math.round(sum / slice.length),
    };
    cache.set(r.key, sample);
    out.set(r.key, sample);
    result.set(r.key, sample);
  }

  resolveBatch(out);
  for (const r of ranges) inFlight.delete(r.key);

  return result;
}
