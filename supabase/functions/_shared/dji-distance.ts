const EARTH_RADIUS_M = 6_371_000;
const MAX_DRONE_SPEED_MS = 40;

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type DjiDistanceTracker = {
  totalMeters: number;
  previous: { lat: number; lng: number; flyTimeMs: number | null; speedMs: number | null } | null;
};

export function createDjiDistanceTracker(): DjiDistanceTracker {
  return { totalMeters: 0, previous: null };
}

/** Adds a full-resolution GPS sample while rejecting jitter and impossible jumps. */
export function addDjiDistanceSample(
  tracker: DjiDistanceTracker,
  lat: number,
  lng: number,
  flyTimeMs: number | null,
  speedMs: number | null,
): void {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0 || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;

  const current = { lat, lng, flyTimeMs, speedMs };
  const previous = tracker.previous;
  tracker.previous = current;
  if (!previous) return;

  const segment = distanceMeters(previous.lat, previous.lng, lat, lng);
  const deltaSeconds = flyTimeMs != null && previous.flyTimeMs != null && flyTimeMs > previous.flyTimeMs
    ? (flyTimeMs - previous.flyTimeMs) / 1000
    : null;
  const measuredSpeed = Math.max(speedMs ?? 0, previous.speedMs ?? 0);
  const moving = measuredSpeed >= 0.3 || segment >= 2;
  const maximumPlausible = deltaSeconds == null
    ? 200
    : Math.max(15, deltaSeconds * Math.max(MAX_DRONE_SPEED_MS, measuredSpeed * 3) + 5);

  if (moving && segment >= 0.25 && segment <= maximumPlausible) tracker.totalMeters += segment;
}

/** Prefer full GPS distance; also recognizes DJI exports whose nominal metre field contains kilometres. */
export function resolveDjiTotalDistance(metadataValue: number | null, gpsMeters: number): number | null {
  const metadata = metadataValue != null && Number.isFinite(metadataValue) && metadataValue >= 0 ? metadataValue : null;
  const gps = Number.isFinite(gpsMeters) && gpsMeters >= 10 ? gpsMeters : null;
  if (gps == null) return metadata;
  if (metadata == null) return Math.round(gps);

  const metadataAsKm = metadata * 1000;
  if (metadata > 0 && metadataAsKm >= gps * 0.5 && metadataAsKm <= gps * 2) return Math.round(gps);
  if (metadata < gps * 0.2) return Math.round(gps);
  if (metadata > gps * 5) return Math.round(gps);
  return Math.round(metadata);
}