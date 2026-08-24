import type { RouteData, RoutePoint, RouteSegment } from "@/types/map";
import { calculateTotalDistance, calculatePolygonAreaKm2 } from "@/lib/mapGeometry";

/** Minste antall punkter i den aktive ruten før man kan starte en ny rute. */
export const MIN_POINTS_FOR_NEW_ROUTE = 3;

/** Farger per rute-indeks (aktiv rute tegnes med disse, inaktive dempet). */
export const ROUTE_COLORS = ["#3b82f6", "#a855f7", "#f97316", "#14b8a6", "#e11d48", "#0ea5e9"];


export function routeColor(index: number): string {
  return ROUTE_COLORS[index % ROUTE_COLORS.length];
}

export function newRouteId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `route-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function makeSegment(coordinates: RoutePoint[] = [], id?: string): RouteSegment {
  return {
    id: id || newRouteId(),
    coordinates: coordinates.map((p) => ({ ...p })),
    totalDistance: calculateTotalDistance(coordinates),
    areaKm2: coordinates.length >= 3 ? calculatePolygonAreaKm2(coordinates) : undefined,
  };
}

/** Leser ruter fra en RouteData. Eldre data uten `routes` tolkes som én rute. */
export function segmentsFromRouteData(route?: RouteData | null): RouteSegment[] {
  if (!route) return [];
  if (Array.isArray(route.routes) && route.routes.length > 0) {
    return route.routes.map((s) => makeSegment(s.coordinates || [], s.id));
  }
  if (route.coordinates?.length) return [makeSegment(route.coordinates)];
  return [];
}

/** Bygger RouteData der toppnivå-feltene speiler den aktive ruten. */
export function routeDataFromSegments(segments: RouteSegment[], activeIndex: number): RouteData {
  const fresh = segments.map((s) => makeSegment(s.coordinates, s.id));
  const active = fresh[Math.min(Math.max(activeIndex, 0), Math.max(fresh.length - 1, 0))];
  return {
    coordinates: active ? [...active.coordinates] : [],
    totalDistance: active?.totalDistance ?? 0,
    areaKm2: active?.areaKm2,
    routes: fresh,
    activeRouteId: active?.id,
  };
}

/** Enkel signatur for å oppdage endringer mellom to sett av ruter. */
export function segmentsSignature(segments: RouteSegment[], activeId?: string): string {
  return (
    (activeId || "") +
    "|" +
    segments
      .map((s) => `${s.id}:${s.coordinates.map((p) => `${p.lat.toFixed(7)},${p.lng.toFixed(7)}`).join(";")}`)
      .join("||")
  );
}
