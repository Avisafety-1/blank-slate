import L from "leaflet";

interface RoutePoint {
  lat: number;
  lng: number;
}

export interface SoraSettings {
  enabled: boolean;
  flightAltitude: number;
  contingencyDistance: number;
  contingencyHeight: number;
  groundRiskDistance: number;
}

export function computeConvexHull(points: RoutePoint[]): RoutePoint[] {
  if (points.length < 3) return points;
  let start = points[0];
  for (const p of points) {
    if (p.lat < start.lat || (p.lat === start.lat && p.lng < start.lng)) {
      start = p;
    }
  }
  const sorted = points.slice().sort((a, b) => {
    if (a === start) return -1;
    if (b === start) return 1;
    const angleA = Math.atan2(a.lng - start.lng, a.lat - start.lat);
    const angleB = Math.atan2(b.lng - start.lng, b.lat - start.lat);
    return angleA - angleB;
  });
  const hull: RoutePoint[] = [];
  for (const p of sorted) {
    while (hull.length >= 2) {
      const a = hull[hull.length - 2];
      const b = hull[hull.length - 1];
      const cross = (b.lat - a.lat) * (p.lng - b.lng) - (b.lng - a.lng) * (p.lat - b.lat);
      if (cross <= 0) hull.pop();
      else break;
    }
    hull.push(p);
  }
  return hull;
}

function intersectLines(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number
): { x: number; y: number } | null {
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

export function bufferPolygon(hull: RoutePoint[], distanceMeters: number): RoutePoint[] {
  if (hull.length < 3 || distanceMeters <= 0) return hull;
  const avgLat = hull.reduce((s, p) => s + p.lat, 0) / hull.length;
  const latScale = 111320;
  const lngScale = 111320 * Math.cos(avgLat * Math.PI / 180);
  const ref = hull[0];
  const pts = hull.map(p => ({
    x: (p.lng - ref.lng) * lngScale,
    y: (p.lat - ref.lat) * latScale,
  }));
  let signedArea = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    signedArea += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  if (signedArea < 0) pts.reverse();
  const n = pts.length;
  const offsetEdges: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = pts[j].x - pts[i].x;
    const dy = pts[j].y - pts[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) continue;
    const nx = dy / len;
    const ny = -dx / len;
    offsetEdges.push({
      x1: pts[i].x + nx * distanceMeters,
      y1: pts[i].y + ny * distanceMeters,
      x2: pts[j].x + nx * distanceMeters,
      y2: pts[j].y + ny * distanceMeters,
    });
  }
  const result: RoutePoint[] = [];
  for (let i = 0; i < offsetEdges.length; i++) {
    const j = (i + 1) % offsetEdges.length;
    const e1 = offsetEdges[i];
    const e2 = offsetEdges[j];
    const ix = intersectLines(e1.x1, e1.y1, e1.x2, e1.y2, e2.x1, e2.y1, e2.x2, e2.y2);
    if (ix) {
      result.push({
        lat: ref.lat + ix.y / latScale,
        lng: ref.lng + ix.x / lngScale,
      });
    }
  }
  return result.length >= 3 ? result : hull;
}

export function renderSoraZones(
  coordinates: RoutePoint[],
  sora: SoraSettings,
  layer: L.LayerGroup
) {
  if (!sora.enabled || coordinates.length < 3) return;

  const hull = computeConvexHull(coordinates);
  if (hull.length < 3) return;

  const contingencyHull = bufferPolygon(hull, sora.contingencyDistance);
  const groundRiskHull = bufferPolygon(hull, sora.contingencyDistance + sora.groundRiskDistance);

  // Red ground risk buffer (outermost)
  L.polygon(
    groundRiskHull.map(p => [p.lat, p.lng] as [number, number]),
    { color: '#ef4444', weight: 2, fillColor: '#ef4444', fillOpacity: 0.12, dashArray: '6, 4' }
  ).bindPopup(`<strong>Ground Risk Buffer</strong><br/>${sora.groundRiskDistance}m`).addTo(layer);

  // Yellow contingency area
  L.polygon(
    contingencyHull.map(p => [p.lat, p.lng] as [number, number]),
    { color: '#eab308', weight: 2, fillColor: '#eab308', fillOpacity: 0.15, dashArray: '6, 4' }
  ).bindPopup(`<strong>Contingency Area</strong><br/>${sora.contingencyDistance}m`).addTo(layer);

  // Green flight geography (hull)
  L.polygon(
    hull.map(p => [p.lat, p.lng] as [number, number]),
    { color: '#22c55e', weight: 2, fillColor: '#22c55e', fillOpacity: 0.20 }
  ).bindPopup(`<strong>Flight Geography</strong><br/>Høyde: ${sora.flightAltitude}m`).addTo(layer);
}
