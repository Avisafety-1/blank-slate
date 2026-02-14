// Utility for fetching terrain elevation data from Open-Meteo API
// and computing AGL / cumulative distance for flight tracks

export interface TerrainPoint {
  lat: number;
  lng: number;
  distance: number; // cumulative km along route
  alt_msl: number | null;
  terrain_elevation: number | null;
  agl: number | null;
  speed: number | null;
  heading: number | null;
  vert_speed: number | null;
  timestamp: string | null;
}

/** Haversine distance in km between two lat/lng points */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Fetch terrain elevations from Open-Meteo in batches of 100 */
export async function fetchTerrainElevations(
  positions: { lat: number; lng: number }[]
): Promise<(number | null)[]> {
  if (positions.length === 0) return [];

  const BATCH_SIZE = 100;
  const elevations: (number | null)[] = [];

  for (let i = 0; i < positions.length; i += BATCH_SIZE) {
    const batch = positions.slice(i, i + BATCH_SIZE);
    const lats = batch.map((p) => p.lat.toFixed(6)).join(",");
    const lngs = batch.map((p) => p.lng.toFixed(6)).join(",");

    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`
      );
      if (res.ok) {
        const data = await res.json();
        const elev: number[] = data.elevation ?? [];
        batch.forEach((_, idx) => {
          elevations.push(elev[idx] ?? null);
        });
      } else {
        batch.forEach(() => elevations.push(null));
      }
    } catch {
      batch.forEach(() => elevations.push(null));
    }
  }

  return elevations;
}

/** Build terrain profile data for a flight track */
export function buildTerrainProfile(
  positions: {
    lat: number;
    lng: number;
    alt?: number;
    alt_msl?: number;
    speed?: number;
    heading?: number;
    vert_speed?: number;
    timestamp?: string;
  }[],
  terrainElevations: (number | null)[]
): TerrainPoint[] {
  let cumDist = 0;
  return positions.map((pos, i) => {
    if (i > 0) {
      cumDist += haversine(
        positions[i - 1].lat,
        positions[i - 1].lng,
        pos.lat,
        pos.lng
      );
    }
    const altMsl = pos.alt_msl ?? pos.alt ?? null;
    const terrain = terrainElevations[i] ?? null;
    const agl = altMsl != null && terrain != null ? altMsl - terrain : null;

    return {
      lat: pos.lat,
      lng: pos.lng,
      distance: Math.round(cumDist * 1000) / 1000, // 3 decimal km
      alt_msl: altMsl,
      terrain_elevation: terrain,
      agl,
      speed: pos.speed ?? null,
      heading: pos.heading ?? null,
      vert_speed: pos.vert_speed ?? null,
      timestamp: pos.timestamp ?? null,
    };
  });
}
