import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RouteData } from "@/types/map";

export interface MissionMapConflict {
  mission_id: string;
  company_id: string;
  public_title: string | null;
  starts_at: string;
  ends_at: string | null;
  public_contact_name: string | null;
  public_contact_phone: string | null;
  public_contact_email: string | null;
  anonymous_publish: boolean;
}

interface Args {
  enabled: boolean;
  tidspunkt: string; // datetime-local
  durationHours?: number; // default 2
  routeData: RouteData | null;
  latitude: number | null;
  longitude: number | null;
  excludeMissionId?: string;
  windowHours?: number; // padding around conflict, default 2
}

function buildGeoJSON(
  routeData: RouteData | null,
  lat: number | null,
  lng: number | null,
): Record<string, unknown> | null {
  const coords = routeData?.coordinates;
  if (coords && coords.length >= 3) {
    const ring = coords.map((p) => [p.lng, p.lat]);
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
    return { type: "Polygon", coordinates: [ring] };
  }
  if (coords && coords.length === 2) {
    return {
      type: "LineString",
      coordinates: coords.map((p) => [p.lng, p.lat]),
    };
  }
  if (lat != null && lng != null) {
    return { type: "Point", coordinates: [lng, lat] };
  }
  return null;
}

export function useMissionMapConflicts({
  enabled,
  tidspunkt,
  durationHours = 2,
  routeData,
  latitude,
  longitude,
  excludeMissionId,
  windowHours = 2,
}: Args) {
  const [conflicts, setConflicts] = useState<MissionMapConflict[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !tidspunkt) {
      setConflicts([]);
      return;
    }
    const geom = buildGeoJSON(routeData, latitude, longitude);
    if (!geom) {
      setConflicts([]);
      return;
    }

    const start = new Date(tidspunkt);
    if (isNaN(start.getTime())) {
      setConflicts([]);
      return;
    }
    const end = new Date(start.getTime() + durationHours * 3600 * 1000);

    let cancelled = false;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc(
          "check_planned_mission_conflicts",
          {
            p_geom_geojson: geom as never,
            p_starts_at: start.toISOString(),
            p_ends_at: end.toISOString(),
            p_exclude_mission_id: excludeMissionId ?? null,
            p_window_hours: windowHours,
          } as never,
        );
        if (cancelled) return;
        if (error) {
          console.warn("check_planned_mission_conflicts failed:", error.message);
          setConflicts([]);
        } else {
          setConflicts((data as MissionMapConflict[] | null) ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [
    enabled,
    tidspunkt,
    durationHours,
    routeData,
    latitude,
    longitude,
    excludeMissionId,
    windowHours,
  ]);

  return { conflicts, loading };
}
