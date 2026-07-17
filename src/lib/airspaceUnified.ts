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

/** Country flags supported today. Add new countries here as they roll out. */
export type UnifiedCountry = "DK";

const FLAG_KEYS: Record<UnifiedCountry, string> = {
  DK: "airspace_unified_dk_enabled",
};

// In-memory flag cache (avoids one round-trip per warning render).
// 60 s TTL is short enough that flipping the flag propagates quickly, and
// long enough to make repeated route edits cheap.
const FLAG_TTL_MS = 60_000;
const flagCache = new Map<string, { value: boolean; fetchedAt: number }>();

/** Returns true if the unified analysis is enabled for a given country. */
export async function isUnifiedAirspaceEnabled(country: UnifiedCountry): Promise<boolean> {
  const key = FLAG_KEYS[country];
  if (!key) return false;

  const cached = flagCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < FLAG_TTL_MS) {
    return cached.value;
  }

  try {
    const { data, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    if (error) {
      // Fail closed: on any error, treat as disabled.
      flagCache.set(key, { value: false, fetchedAt: Date.now() });
      return false;
    }

    const enabled = data?.value === "true";
    flagCache.set(key, { value: enabled, fetchedAt: Date.now() });
    return enabled;
  } catch {
    flagCache.set(key, { value: false, fetchedAt: Date.now() });
    return false;
  }
}

/** Test-only: clear the flag cache. */
export function _clearUnifiedFlagCache() {
  flagCache.clear();
}

function buildLineStringGeoJson(routePoints: UnifiedRoutePoint[]) {
  return {
    type: "LineString",
    coordinates: routePoints.map((p) => [p.lng, p.lat]),
  };
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

  const enabled = await isUnifiedAirspaceEnabled(country);
  if (!enabled) return [];

  // Clamp buffer to the RPC's safety cap (100 km).
  const safeBuffer = Math.max(0, Math.min(bufferM, 100_000));

  try {
    const routeGeoJson = buildLineStringGeoJson(routePoints);
    const { data, error } = await supabase.rpc("airspace_zones_intersecting_route", {
      p_route: routeGeoJson as any,
      p_buffer_m: safeBuffer,
      p_country_codes: [country],
    });

    if (error || !Array.isArray(data)) return [];

    return data.map((row: any): UnifiedAirspaceZone => {
      const isInside = Boolean(row.route_inside);
      const distance = Number(row.min_distance ?? 0);
      const restriction = String(row.restriction_type ?? "info");
      return {
        z_id: String(row.z_id),
        zone_type: String(row.zone_type ?? "UNKNOWN"),
        restriction_type: restriction,
        zone_name: String(row.z_name ?? ""),
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
