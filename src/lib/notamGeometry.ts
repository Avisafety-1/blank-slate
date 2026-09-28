import type { RoutePoint } from "@/types/map";

/** Keep the polygon with the existing NOTAM schedule JSON, without a schema change. */
export function validNotamPolygon(value: unknown): RoutePoint[] | null {
  if (!Array.isArray(value)) return null;
  const points = value.map((p) => ({ lat: Number(p?.lat), lng: Number(p?.lng) }));
  if (points.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180)) return null;
  if (points.length > 1 && points[0].lat === points[points.length - 1].lat && points[0].lng === points[points.length - 1].lng) points.pop();
  if (new Set(points.map((p) => `${p.lat},${p.lng}`)).size < 3) return null;
  // Shoelace area: reject collinear points, which cannot bound an area.
  const twiceArea = points.reduce((sum, p, i) => {
    const next = points[(i + 1) % points.length];
    return sum + p.lng * next.lat - next.lng * p.lat;
  }, 0);
  return Math.abs(twiceArea) > 1e-10 ? points : null;
}

export function savedNotamPolygon(windows: unknown): RoutePoint[] | null {
  if (!Array.isArray(windows) || windows[0]?.areaMode !== "polygon") return null;
  return validNotamPolygon(windows[0].polygon);
}

export function toNotamCoord(lat: number, lng: number): string {
  const formatDms = (value: number, latitude: boolean) => {
    const seconds = Math.round(Math.abs(value) * 3600);
    const degrees = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    const direction = latitude ? (value >= 0 ? "N" : "S") : (value >= 0 ? "E" : "W");
    return `${String(degrees).padStart(latitude ? 2 : 3, "0")}${String(minutes).padStart(2, "0")}${String(remainder).padStart(2, "0")}${direction}`;
  };
  return `${formatDms(lat, true)} ${formatDms(lng, false)}`;
}