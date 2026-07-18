/**
 * Unified airspace helper (Phase A4 preparation)
 *
 * Reads from the country-agnostic `airspace_zones` table via the
 * `airspace_zones_intersecting_route` RPC and returns results shaped like
 * the legacy AirspaceWarnings so they can be merged into existing UI.
 *
 * Feature-flagged: gated by the `airspace_unified_dk_enabled` (and future
 * per-country) flags in `public.app_config`. When the flag is off, all
 * public functions in this module short-circuit and return empty results,
 * making it safe to call from production code paths without affecting
 * current behavior.
 */
import { supabase } from "@/integrations/supabase/client";

export interface UnifiedRoutePoint {
  lat: number;
  lng: number;
}

export interface UnifiedAirspaceZone {
  z_id: string;
  zone_type: string;         // normalized cross-country type: 'CTR', 'TIZ', 'R', 'D', 'P', 'DRONE_RED', ...
  restriction_type: string;  // 'prohibited' | 'restricted' | 'notification' | 'info'
  zone_name: string;
  country_code: string;
  source: string;
  min_distance: number;      // meters
  is_inside: boolean;
  level: "warning" | "caution" | "note";
}

/** Countries supported by the unified pipeline today. NO is intentionally excluded. */
export type UnifiedCountry = "DK" | "SE" | "DE" | "FI";

type Bounds = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

// Broad country envelopes with margin for near-border route buffers.
// These are intentionally coarse: they only prevent obviously irrelevant
// country lookups while avoiding false negatives near borders.
const COUNTRY_BOUNDS: Record<UnifiedCountry, Bounds> = {
  DK: { minLng: 7.5, minLat: 54.4, maxLng: 15.8, maxLat: 58.2 },
  SE: { minLng: 10.85, minLat: 55.0, maxLng: 25.8, maxLat: 69.4 },
  DE: { minLng: 5.5, minLat: 47.0, maxLng: 15.7, maxLat: 55.4 },
  FI: { minLng: 19.0, minLat: 59.5, maxLng: 32.2, maxLat: 70.3 },
};

const UNIFIED_RPC_TIMEOUT_MS = 4_500;

// In-memory flag cache (avoids one round-trip per warning render).
// 60 s TTL is short enough that flipping the flag propagates quickly, and
// long enough to make repeated route edits cheap.
const FLAG_TTL_MS = 60_000;
let flagCache: { value: boolean; fetchedAt: number } | null = null;

/**
 * Returns true if the unified analysis is enabled for the CURRENT USER.
 *
 * Gated by two independent switches (see `is_unified_airspace_enabled_for_me`):
 *   1) global master flag `airspace_unified_dk_enabled` in app_config, AND
 *   2) the user's active company is in `airspace_unified_company_allowlist`.
 *
 * Fail-closed on any error. The `country` argument is kept for API stability
 * and future per-country gating; today the same gate applies to all supported
 * countries.
 */
export async function isUnifiedAirspaceEnabled(_country?: UnifiedCountry): Promise<boolean> {
  if (flagCache && Date.now() - flagCache.fetchedAt < FLAG_TTL_MS) {
    return flagCache.value;
  }

  try {
    const { data, error } = await supabase.rpc("is_unified_airspace_enabled_for_me");
    if (error) {
      flagCache = { value: false, fetchedAt: Date.now() };
      return false;
    }
    const enabled = data === true;
    flagCache = { value: enabled, fetchedAt: Date.now() };
    return enabled;
  } catch {
    flagCache = { value: false, fetchedAt: Date.now() };
    return false;
  }
}

/** Test-only: clear the flag cache. */
export function _clearUnifiedFlagCache() {
  flagCache = null;
}

function buildLineStringGeoJson(routePoints: UnifiedRoutePoint[]) {
  return {
    type: "LineString",
    coordinates: routePoints.map((p) => [p.lng, p.lat]),
  };
}

function getRouteBounds(routePoints: UnifiedRoutePoint[]): Bounds | null {
  const validPoints = routePoints.filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng),
  );
  if (validPoints.length === 0) return null;

  return validPoints.reduce<Bounds>(
    (bounds, point) => ({
      minLng: Math.min(bounds.minLng, point.lng),
      minLat: Math.min(bounds.minLat, point.lat),
      maxLng: Math.max(bounds.maxLng, point.lng),
      maxLat: Math.max(bounds.maxLat, point.lat),
    }),
    {
      minLng: validPoints[0].lng,
      minLat: validPoints[0].lat,
      maxLng: validPoints[0].lng,
      maxLat: validPoints[0].lat,
    },
  );
}

function expandBounds(bounds: Bounds, bufferM: number): Bounds {
  const safeBuffer = Math.max(0, Math.min(bufferM, 100_000));
  const centerLat = (bounds.minLat + bounds.maxLat) / 2;
  const latPadding = safeBuffer / 111_320;
  const lngPadding = safeBuffer / Math.max(1, 111_320 * Math.cos((centerLat * Math.PI) / 180));

  return {
    minLng: bounds.minLng - lngPadding,
    minLat: bounds.minLat - latPadding,
    maxLng: bounds.maxLng + lngPadding,
    maxLat: bounds.maxLat + latPadding,
  };
}

function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return a.minLng <= b.maxLng && a.maxLng >= b.minLng && a.minLat <= b.maxLat && a.maxLat >= b.minLat;
}

export function routeMayIntersectCountry(
  country: UnifiedCountry,
  routePoints: UnifiedRoutePoint[] | undefined,
  bufferM: number = 500,
): boolean {
  if (!routePoints || routePoints.length < 2) return false;
  const routeBounds = getRouteBounds(routePoints);
  if (!routeBounds) return false;
  return boundsOverlap(expandBounds(routeBounds, bufferM), COUNTRY_BOUNDS[country]);
}

export function getUnifiedCountriesForRoute(
  routePoints: UnifiedRoutePoint[] | undefined,
  bufferM: number = 500,
): UnifiedCountry[] {
  const countries: UnifiedCountry[] = ["DK", "SE", "DE", "FI"];
  return countries.filter((country) => routeMayIntersectCountry(country, routePoints, bufferM));
}

function severityFromRestriction(
  restriction: string,
  isInside: boolean,
  distance: number,
): "warning" | "caution" | "note" {
  if (isInside && (restriction === "prohibited" || restriction === "restricted")) {
    return "warning";
  }
  if (isInside) return "caution";
  if (distance < 500) return "caution";
  return "note";
}

/**
 * Fetch unified zones intersecting (or near) a route.
 *
 * Returns [] when the flag is off, when the route is invalid, or on any
 * error. Callers should merge these zones with legacy warnings.
 *
 * @param country     Which country's flag to check.
 * @param routePoints Route as lat/lng points (min 2).
 * @param bufferM     Buffer around the route in meters (default 500 m).
 */
export async function fetchUnifiedZonesForRoute(
  country: UnifiedCountry,
  routePoints: UnifiedRoutePoint[] | undefined,
  bufferM: number = 500,
): Promise<UnifiedAirspaceZone[]> {
  if (!routePoints || routePoints.length < 2) return [];
  // Defence in depth: NO is never sent to the unified pipeline in C1.
  if ((country as string) === "NO") return [];
  if (!routeMayIntersectCountry(country, routePoints, bufferM)) return [];

  const enabled = await isUnifiedAirspaceEnabled(country);
  if (!enabled) return [];

  // Clamp buffer to the RPC's safety cap (100 km).
  const safeBuffer = Math.max(0, Math.min(bufferM, 100_000));

  try {
    const routeGeoJson = buildLineStringGeoJson(routePoints);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), UNIFIED_RPC_TIMEOUT_MS);
    const response = await (async (): Promise<{ data: any; error: any }> => {
      try {
        return await supabase.rpc("airspace_zones_intersecting_route", {
          p_route: routeGeoJson as any,
          p_buffer_m: safeBuffer,
          p_country_codes: [country],
        }, { signal: controller.signal } as any) as any;
      } finally {
        window.clearTimeout(timeoutId);
      }
    })();

    const { data, error } = response;

    if (error || !Array.isArray(data)) return [];

    return data.map((row: any): UnifiedAirspaceZone => {
      const isInside = Boolean(row.route_inside);
      const distance = Number(row.distance_m ?? 0);
      const restriction = String(row.restriction_type ?? "info").toLowerCase();
      return {
        z_id: String(row.id),
        zone_type: String(row.zone_type ?? "UNKNOWN"),
        restriction_type: restriction,
        zone_name: String(row.name ?? ""),
        country_code: String(row.country_code ?? country),
        source: String(row.source ?? ""),
        min_distance: distance,
        is_inside: isInside,
        level: severityFromRestriction(restriction, isInside, distance),
      };
    });
  } catch {
    return [];
  }
}
