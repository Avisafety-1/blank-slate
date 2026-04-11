/**
 * SORA 2.5 Adjacent Area Population Density Calculator
 *
 * Regulatory basis:
 * - JARUS SORA 2.5 (JAR-DEL-SRM-SORA-MB-2.5, May 2024)
 * - Norwegian CAA SORA 2.5 calculator: training.caa.no/SORA-2.5-calculator/containment.html
 *
 * The adjacent area extends from the outer edge of the ground risk buffer
 * to a radius determined by max(5 km, distance drone can fly in 3 minutes).
 * For drones > 250 g the minimum is always 5 km.
 */

import type { RoutePoint, SoraSettings } from "@/types/map";

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
/*  Source: Luftfartstilsynet SORA 2.5 calculator                     */
/* ------------------------------------------------------------------ */

const DENSITY_THRESHOLDS: Record<ContainmentLevel, number> = {
  low: 50,
  medium: 50_000,
  high: Infinity, // no upper limit
};

export function getDensityThreshold(level: ContainmentLevel): number {
  return DENSITY_THRESHOLDS[level];
}

/* ------------------------------------------------------------------ */
/*  Adjacent area radius                                               */
/* ------------------------------------------------------------------ */

/**
 * Calculate the adjacent area radius.
 * Formula: max(5000, min(35000, maxSpeed_mps * 180))
 * For drones > 250 g the minimum is 5 km.
 */
export function calculateAdjacentRadius(maxSpeedMps: number | undefined): number {
  const speed = maxSpeedMps ?? 0;
  const distIn3Min = speed * 180; // 3 minutes
  return Math.max(5000, Math.min(35000, distIn3Min));
}

/* ------------------------------------------------------------------ */
/*  SSB WFS population data fetch                                      */
/* ------------------------------------------------------------------ */

interface SsbPopulationCell {
  population: number;
  centroidLat: number;
  centroidLng: number;
}

/**
 * Fetch SSB 1 km² population grid cells within a bounding box.
 * Uses a Supabase edge function proxy to avoid CORS issues with SSB WFS.
 */
export async function fetchSsbPopulationGrid(
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  signal?: AbortSignal
): Promise<SsbPopulationCell[]> {
  const { supabase } = await import("@/integrations/supabase/client");
  const supabaseUrl = (supabase as any).supabaseUrl ?? "https://pmucsvrypogtttrajqxq.supabase.co";

  // BBOX format: minLat,minLng,maxLat,maxLng,EPSG:4326
  const bboxStr = `${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng},EPSG:4326`;
  const url = `${supabaseUrl}/functions/v1/ssb-population?bbox=${encodeURIComponent(bboxStr)}`;

  const resp = await fetch(url, {
    signal,
    headers: {
      "apikey": (supabase as any).supabaseKey ?? "",
    },
  });

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "");
    throw new Error(`SSB population proxy error: ${resp.status} ${errBody}`);
  }

  const geojson = await resp.json();
  const cells: SsbPopulationCell[] = [];

  if (!geojson?.features) return cells;

  for (const feature of geojson.features) {
    const props = feature.properties;
    // The population field name may vary — try common variants
    const pop =
      props?.pop_tot ??
      props?.antall_personer ??
      props?.antpers ??
      props?.sum_alle ??
      props?.befolkning ??
      props?.POP_TOT ??
      0;

    if (pop <= 0) continue;

    // Get centroid from geometry (polygon or point)
    let centroidLat = 0;
    let centroidLng = 0;
    const geom = feature.geometry;
    if (geom?.type === "Point") {
      [centroidLng, centroidLat] = geom.coordinates;
    } else if (geom?.type === "Polygon" && geom.coordinates?.[0]) {
      const ring = geom.coordinates[0];
      let sumLat = 0, sumLng = 0;
      for (const [lng, lat] of ring) {
        sumLat += lat;
        sumLng += lng;
      }
      centroidLat = sumLat / ring.length;
      centroidLng = sumLng / ring.length;
    } else if (geom?.type === "MultiPolygon" && geom.coordinates?.[0]?.[0]) {
      const ring = geom.coordinates[0][0];
      let sumLat = 0, sumLng = 0;
      for (const [lng, lat] of ring) {
        sumLat += lat;
        sumLng += lng;
      }
      centroidLat = sumLat / ring.length;
      centroidLng = sumLng / ring.length;
    }

    cells.push({ population: Number(pop), centroidLat, centroidLng });
  }

  return cells;
}

/* ------------------------------------------------------------------ */
/*  Core computation                                                   */
/* ------------------------------------------------------------------ */

/**
 * Compute the centroid of a set of route points.
 */
function routeCentroid(coords: RoutePoint[]): RoutePoint {
  const n = coords.length;
  const lat = coords.reduce((s, p) => s + p.lat, 0) / n;
  const lng = coords.reduce((s, p) => s + p.lng, 0) / n;
  return { lat, lng };
}

/**
 * Haversine distance between two points, in meters.
 */
function haversineM(a: RoutePoint, b: RoutePoint): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Calculate the bounding box that covers the adjacent area.
 */
function adjacentBbox(center: RoutePoint, radiusM: number) {
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.cos((center.lat * Math.PI) / 180));
  return {
    minLat: center.lat - dLat,
    maxLat: center.lat + dLat,
    minLng: center.lng - dLng,
    maxLng: center.lng + dLng,
  };
}

/**
 * Calculate the maximum distance from centroid to any route point,
 * plus the full SORA buffer (flightGeo + contingency + groundRisk).
 */
function outerBufferRadius(coords: RoutePoint[], sora: SoraSettings): number {
  const center = routeCentroid(coords);
  let maxDist = 0;
  for (const p of coords) {
    const d = haversineM(center, p);
    if (d > maxDist) maxDist = d;
  }
  return maxDist + sora.flightGeographyDistance + sora.contingencyDistance + sora.groundRiskDistance;
}

/**
 * Main entry: compute adjacent area population density.
 */
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

  const center = routeCentroid(coords);
  const innerRadiusM = outerBufferRadius(coords, sora);

  // Bounding box for the full adjacent area
  const bbox = adjacentBbox(center, adjacentRadiusM);

  // Fetch SSB data
  const cells = await fetchSsbPopulationGrid(bbox, signal);

  // Filter cells that are inside adjacent area (between inner and outer radius)
  let totalPop = 0;
  for (const cell of cells) {
    const dist = haversineM(center, { lat: cell.centroidLat, lng: cell.centroidLng });
    if (dist >= innerRadiusM && dist <= adjacentRadiusM) {
      totalPop += cell.population;
    }
  }

  // Calculate donut area
  const outerAreaKm2 = (Math.PI * adjacentRadiusM * adjacentRadiusM) / 1e6;
  const innerAreaKm2 = (Math.PI * innerRadiusM * innerRadiusM) / 1e6;
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
