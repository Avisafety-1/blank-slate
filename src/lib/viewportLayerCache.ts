import L from "leaflet";

/**
 * Viewport-bounds cache + incremental diff rendering for map data fetchers.
 *
 * Eliminates the "blink" caused by `layer.clearLayers()` + re-render on every
 * `moveend`. Strategy:
 *  1. Skip the fetch entirely when the current viewport is contained inside the
 *     last (padded) bounds we already fetched.
 *  2. On real refetch: diff features by stable id — keep what's still in the
 *     result, only add new ones, only remove the ones that disappeared.
 */

export type BBox = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
};

interface CacheEntry {
  cachedBounds: BBox | null;
  features: Map<string, L.Layer>;
  /** The LayerGroup the features were rendered into (detect map remounts). */
  layerRef?: L.LayerGroup | null;
  /** Timestamp of the last successful fetch (ms epoch). */
  fetchedAt?: number;
}

const caches = new Map<string, CacheEntry>();

export function getCache(key: string): CacheEntry {
  let c = caches.get(key);
  if (!c) {
    c = { cachedBounds: null, features: new Map(), layerRef: null, fetchedAt: 0 };
    caches.set(key, c);
  }
  return c;
}

/**
 * True when the cache can be reused: same LayerGroup (still attached to a map),
 * not older than `maxAgeMs`, and the current viewport already covered.
 * Otherwise the cache is reset so the caller performs a fresh fetch.
 */
export function isCacheValid(
  key: string,
  layer: L.LayerGroup,
  current: BBox,
  maxAgeMs = 5 * 60 * 1000,
): boolean {
  const c = caches.get(key);
  if (!c) return false;
  const staleLayer = c.layerRef !== layer || !(layer as any)._map;
  const expired = !c.fetchedAt || Date.now() - c.fetchedAt > maxAgeMs;
  if (staleLayer || expired) {
    // Drop stale state; features belonging to an old layer group are orphaned
    // with that group, so only clear from the current layer when it matches.
    resetCache(key, c.layerRef === layer ? layer : undefined);
    return false;
  }
  return bboxCovered(c.cachedBounds, current);
}


/** True if `current` lies entirely within `cached`. */
export function bboxCovered(cached: BBox | null, current: BBox): boolean {
  if (!cached) return false;
  return (
    cached.minLat <= current.minLat &&
    cached.minLng <= current.minLng &&
    cached.maxLat >= current.maxLat &&
    cached.maxLng >= current.maxLng
  );
}

/** Expand bbox by `factor` (0.5 ⇒ +50% on each side). */
export function padBBox(b: BBox, factor = 0.5): BBox {
  const dLat = ((b.maxLat - b.minLat) * factor) / 2;
  const dLng = ((b.maxLng - b.minLng) * factor) / 2;
  return {
    minLat: b.minLat - dLat,
    minLng: b.minLng - dLng,
    maxLat: b.maxLat + dLat,
    maxLng: b.maxLng + dLng,
  };
}

export function boundsToBBox(b: L.LatLngBounds): BBox {
  return {
    minLat: b.getSouth(),
    minLng: b.getWest(),
    maxLat: b.getNorth(),
    maxLng: b.getEast(),
  };
}

/**
 * Cheap stable string hash (djb2). Good enough to produce a stable id from
 * geometry payloads when the source lacks a primary key.
 */
export function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/**
 * Diff-render: keeps existing features, adds only new ones, removes only those
 * no longer in `items`.
 */
export function diffRender<T>(
  layer: L.LayerGroup,
  cache: CacheEntry,
  items: T[],
  getId: (item: T) => string,
  createLayer: (item: T) => L.Layer | null,
): void {
  const newIds = new Set<string>();
  for (const item of items) {
    const id = getId(item);
    newIds.add(id);
    if (cache.features.has(id)) continue;
    try {
      const lyr = createLayer(item);
      if (!lyr) continue;
      lyr.addTo(layer);
      cache.features.set(id, lyr);
    } catch {
      /* skip bad item */
    }
  }
  // Remove vanished features
  for (const [id, lyr] of cache.features) {
    if (!newIds.has(id)) {
      try {
        layer.removeLayer(lyr);
      } catch {
        /* ignore */
      }
      cache.features.delete(id);
    }
  }
}

/**
 * Clear all rendered features for a cache key and wipe its cached bounds.
 * Use on layer toggle-off so the next toggle-on triggers a fresh fetch.
 */
export function resetCache(key: string, layer?: L.LayerGroup): void {
  const c = caches.get(key);
  if (!c) return;
  if (layer) {
    for (const lyr of c.features.values()) {
      try {
        layer.removeLayer(lyr);
      } catch {
        /* ignore */
      }
    }
  }
  caches.delete(key);
}

/** Reset many cache keys at once. */
export function resetCaches(entries: Array<[string, L.LayerGroup | undefined]>): void {
  for (const [key, layer] of entries) resetCache(key, layer);
}
