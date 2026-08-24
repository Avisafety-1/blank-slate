import { segmentsFromRouteData } from "@/lib/routeSegments";
import type { RouteData, RoutePoint } from "@/types/map";

export interface AirspaceRouteSegment {
  id: string;
  label: string;
  coordinates: RoutePoint[];
}

/**
 * Bygger rutesegmentene som skal brukes i luftromsanalysen for et oppdrag.
 * Advarsler beregnes for ALLE ruter (worst case) på oppdragskortene.
 */
export function getAirspaceRouteSegments(
  route: RouteData | null | undefined,
  labelFor: (index: number) => string,
): AirspaceRouteSegment[] {
  return segmentsFromRouteData(route ?? null)
    .filter((s) => s.coordinates.length > 0)
    .map((s, index) => ({
      id: s.id,
      label: s.name?.trim() || labelFor(index),
      coordinates: s.coordinates,
    }));
}
