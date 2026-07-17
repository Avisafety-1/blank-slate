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
