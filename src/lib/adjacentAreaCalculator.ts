/**
 * SORA 2.5 Adjacent Area Population Density Calculator
 *
 * Regulatory basis:
 * - JARUS SORA 2.5 (JAR-DEL-SRM-SORA-MB-2.5, May 2024)
 * - Norwegian CAA SORA 2.5 calculator: training.caa.no/SORA-2.5-calculator/containment.html
 *
 * The adjacent area extends from the outer edge of the ground risk buffer
 * to a radius determined by max(5 km, distance drone can fly in 3 minutes).
 * Population filtering uses polygon-based geometry matching the map visualization.
 */

import type { RoutePoint, SoraSettings } from "@/types/map";
import { bufferPolyline, bufferPolygon, computeConvexHull } from "@/lib/soraGeometry";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AdjacentAreaResult {
  /** Radius of the adjacent area from the operational volume center, in meters */
  adjacentRadiusM: number;
  /** Area of the adjacent "donut" in km² */
  adjacentAreaKm2: number;
  /** Total population found in the adjacent area */
  totalPopulation: number;
  /** Average population density in adjacent area (ppl/km²) */
  avgDensity: number;
  /** Threshold for the current containment level */
  threshold: number;
  /** Whether the density is within the threshold */
  pass: boolean;
  /** Containment level used */
  containmentLevel: "low" | "medium" | "high";
  /** Human-readable status text */
  statusText: string;
  /** Loading / error state */
  error?: string;
}

export type ContainmentLevel = "low" | "medium" | "high";

/* ------------------------------------------------------------------ */
/*  SORA 2.5 adjacent area thresholds (simplified, UA < 3 m)          */
/* ------------------------------------------------------------------ */

const DENSITY_THRESHOLDS: Record<ContainmentLevel, number> = {
  low: 50,
  medium: 50_000,
  high: Infinity,
};

export function getDensityThreshold(level: ContainmentLevel): number {
  return DENSITY_THRESHOLDS[level];
}

/* ------------------------------------------------------------------ */
/*  Adjacent area radius                                               */
/* ------------------------------------------------------------------ */

export function calculateAdjacentRadius(maxSpeedMps: number | undefined): number {
  const speed = maxSpeedMps ?? 0;
  const distIn3Min = speed * 180;
  return Math.max(5000, Math.min(35000, distIn3Min));
}

/* ------------------------------------------------------------------ */
/*  Geometry helpers                                                   */
/* ------------------------------------------------------------------ */

/** Ray-casting point-in-polygon test */
function pointInPolygon(point: RoutePoint, polygon: RoutePoint[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    if (
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Shoelace formula for polygon area in km² (lat/lng coordinates) */
function polygonAreaKm2(polygon: RoutePoint[]): number {
  if (polygon.length < 3) return 0;
  const avgLat = polygon.reduce((s, p) => s + p.lat, 0) / polygon.length;
  const latScale = 111.320; // km per degree latitude
  const lngScale = 111.320 * Math.cos(avgLat * Math.PI / 180); // km per degree longitude

  let area = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = polygon[i].lng * lngScale;
    const yi = polygon[i].lat * latScale;
    const xj = polygon[j].lng * lngScale;
    const yj = polygon[j].lat * latScale;
    area += xi * yj - xj * yi;
  }
  return Math.abs(area) / 2;
}

/** Compute bounding box from polygon vertices */
function bboxFromPolygon(polygon: RoutePoint[]) {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of polygon) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

/* ------------------------------------------------------------------ */
/*  Buffer builder (mirrors renderAdjacentAreaZone logic)              */
/* ------------------------------------------------------------------ */

function makeBuffer(
  coords: RoutePoint[],
  sora: SoraSettings,
  dist: number
): RoutePoint[] {
  if (dist <= 0) return coords;

  const refPoint = coords[0];
  const avgLat = coords.reduce((s, p) => s + p.lat, 0) / coords.length;

  const isClosedRoute =
    coords.length >= 3 &&
    coords[0].lat === coords[coords.length - 1].lat &&
    coords[0].lng === coords[coords.length - 1].lng;

  const mode = sora.bufferMode ?? "corridor";
  if (mode === "convexHull" || isClosedRoute) {
    const hull = computeConvexHull(coords);
    return bufferPolygon(hull, dist, refPoint, avgLat);
  }
  return bufferPolyline(coords, dist, 16, refPoint, avgLat);
}

/* ------------------------------------------------------------------ */
/*  SSB WFS population data fetch                                      */
/* ------------------------------------------------------------------ */

interface SsbPopulationCell {
  population: number;
  centroidLat: number;
  centroidLng: number;
}

export async function fetchSsbPopulationGrid(
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  signal?: AbortSignal
): Promise<SsbPopulationCell[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const bboxStr = `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`;
  const url = `${supabaseUrl}/functions/v1/ssb-population?bbox=${encodeURIComponent(bboxStr)}`;

  const resp = await fetch(url, {
    signal,
    headers: { "apikey": supabaseKey },
  });

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "");
    throw new Error(`SSB population proxy error: ${resp.status} ${errBody}`);
  }

  const data = await resp.json();
  const cells: SsbPopulationCell[] = [];
  if (!data?.features) return cells;

  for (const feature of data.features) {
    cells.push({
      population: feature.pop_tot,
      centroidLat: feature.centroidLat,
      centroidLng: feature.centroidLng,
    });
  }
  return cells;
}

/* ------------------------------------------------------------------ */
/*  Core computation                                                   */
/* ------------------------------------------------------------------ */

export async function computeAdjacentAreaDensity(
  coords: RoutePoint[],
  sora: SoraSettings,
  maxSpeedMps: number | undefined,
  containmentLevel: ContainmentLevel,
  signal?: AbortSignal
): Promise<AdjacentAreaResult> {
  const adjacentRadiusM = calculateAdjacentRadius(maxSpeedMps);
  const threshold = getDensityThreshold(containmentLevel);

  if (coords.length < 1) {
    return {
      adjacentRadiusM,
      adjacentAreaKm2: 0,
      totalPopulation: 0,
      avgDensity: 0,
      threshold,
      pass: true,
      containmentLevel,
      statusText: "Ingen rute",
    };
  }

  // Build inner polygon (ground risk buffer boundary)
  const fgDist = sora.flightGeographyDistance;
  const cDist = sora.contingencyDistance;
  const grDist = sora.groundRiskDistance;
  const innerDist = fgDist + cDist + grDist;
  const outerDist = innerDist + adjacentRadiusM;

  const innerPoly = makeBuffer(coords, sora, innerDist);
  const outerPoly = makeBuffer(coords, sora, outerDist);

  // Bounding box from actual polygon
  const bbox = bboxFromPolygon(outerPoly);

  // Fetch SSB data
  const cells = await fetchSsbPopulationGrid(bbox, signal);

  // Filter cells using polygon-based point-in-polygon
  let totalPop = 0;
  for (const cell of cells) {
    const pt: RoutePoint = { lat: cell.centroidLat, lng: cell.centroidLng };
    if (pointInPolygon(pt, outerPoly) && !pointInPolygon(pt, innerPoly)) {
      totalPop += cell.population;
    }
  }

  // Calculate actual polygon areas
  const outerAreaKm2 = polygonAreaKm2(outerPoly);
  const innerAreaKm2 = polygonAreaKm2(innerPoly);
  const adjacentAreaKm2 = Math.max(outerAreaKm2 - innerAreaKm2, 0.01);

  const avgDensity = totalPop / adjacentAreaKm2;
  const pass = avgDensity <= threshold;

  const statusText = pass
    ? `${avgDensity.toFixed(1)} pers/km² — innenfor grensen (${threshold})`
    : `${avgDensity.toFixed(1)} pers/km² — overskrider grensen (${threshold})`;

  return {
    adjacentRadiusM,
    adjacentAreaKm2,
    totalPopulation: totalPop,
    avgDensity,
    threshold,
    pass,
    containmentLevel,
    statusText,
  };
}
