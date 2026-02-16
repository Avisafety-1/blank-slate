import { useEffect, useRef } from "react";
import L from "leaflet";
import { supabase } from "@/integrations/supabase/client";
import "leaflet/dist/leaflet.css";
import { fetchTerrainElevations } from "@/lib/terrainElevation";

interface RoutePoint {
  lat: number;
  lng: number;
}

interface SoraSettings {
  enabled: boolean;
  flightAltitude: number;
  contingencyDistance: number;
  contingencyHeight: number;
  groundRiskDistance: number;
}

interface RouteData {
  coordinates: RoutePoint[];
  totalDistance: number;
  soraSettings?: SoraSettings;
}

interface FlightTrackPosition {
  lat: number;
  lng: number;
  alt?: number;
  alt_msl?: number;
  alt_agl?: number;
  speed?: number;
  heading?: number;
  vert_speed?: number;
  timestamp?: string;
}

interface FlightTrack {
  positions: FlightTrackPosition[];
  flightLogId?: string;
  flightDate?: string;
}

interface MissionMapPreviewProps {
  latitude: number;
  longitude: number;
  route?: RouteData | null;
  flightTracks?: FlightTrack[] | null;
}

// --- SORA geometry utilities (duplicated from OpenAIPMap for self-containment) ---

function computeConvexHull(points: RoutePoint[]): RoutePoint[] {
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

function bufferPolygon(hull: RoutePoint[], distanceMeters: number): RoutePoint[] {
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

// --- End SORA geometry utilities ---

function renderSoraZones(map: L.Map, route: RouteData, layer: L.LayerGroup) {
  const sora = route.soraSettings;
  if (!sora?.enabled || route.coordinates.length < 3) return;

  const hull = computeConvexHull(route.coordinates);
  if (hull.length < 3) return;

  const contingencyHull = bufferPolygon(hull, sora.contingencyDistance);
  const groundRiskHull = bufferPolygon(hull, sora.contingencyDistance + sora.groundRiskDistance);

  // Red ground risk buffer (outermost, drawn first)
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

export const MissionMapPreview = ({ latitude, longitude, route, flightTracks }: MissionMapPreviewProps) => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const terrainElevationsRef = useRef<globalThis.Map<string, number>>(new globalThis.Map());

  useEffect(() => {
    if (!mapRef.current || !latitude || !longitude) return;

    // Initialize map
    const map = L.map(mapRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
    }).setView([latitude, longitude], 11);
    
    leafletMapRef.current = map;

    // Add base layer
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    // Add mission marker
    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
          <circle cx="12" cy="10" r="3" fill="#3b82f6"/>
        </svg>
      </div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 40],
    });

    L.marker([latitude, longitude], { icon })
      .addTo(map)
      .bindPopup("Oppdragsposisjon");

    // Collect all points for bounds calculation
    const allPoints: [number, number][] = [[latitude, longitude]];

    // Display SORA buffer zones if present (before route so route draws on top)
    const soraLayer = L.layerGroup().addTo(map);
    if (route) {
      renderSoraZones(map, route, soraLayer);
    }

    // Display planned route if provided (blue dashed line)
    if (route && route.coordinates.length > 0) {
      const routeLayer = L.layerGroup().addTo(map);
      
      // Draw polyline
      if (route.coordinates.length > 1) {
        const latLngs = route.coordinates.map(p => [p.lat, p.lng] as [number, number]);
        L.polyline(latLngs, {
          color: '#3b82f6',
          weight: 3,
          opacity: 0.8,
          dashArray: '10, 5'
        }).addTo(routeLayer);
        
        latLngs.forEach(ll => allPoints.push(ll));
      }

      // Add numbered markers for route points
      route.coordinates.forEach((point, index) => {
        const isFirst = index === 0;
        const isLast = index === route.coordinates.length - 1 && route.coordinates.length > 1;
        
        let bgColor = '#3b82f6'; // blue default
        if (isFirst) bgColor = '#22c55e'; // green for start
        else if (isLast) bgColor = '#ef4444'; // red for end

        const marker = L.marker([point.lat, point.lng], {
          icon: L.divIcon({
            className: '',
            html: `<div style="
              width: 24px;
              height: 24px;
              background: ${bgColor};
              border: 2px solid white;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-weight: bold;
              font-size: 11px;
              box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            ">${index + 1}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          }),
        });
        marker.addTo(routeLayer);
      });
    }

    // Display flight tracks if provided (green solid line) with clickable telemetry popups
    if (flightTracks && flightTracks.length > 0) {
      // Create a custom pane for flight tracks above all airspace layers
      if (!map.getPane('flightTrackPane')) {
        map.createPane('flightTrackPane');
        map.getPane('flightTrackPane')!.style.zIndex = '700';
        map.getPane('popupPane')!.style.zIndex = '800';
      }
      const tracksLayer = L.layerGroup().addTo(map);

      // Fetch terrain elevations for AGL display in popups
      const allTrackPositions = flightTracks.flatMap(t => t.positions || []);
      fetchTerrainElevations(allTrackPositions).then((elevations) => {
        allTrackPositions.forEach((pos, i) => {
          if (elevations[i] != null) {
            terrainElevationsRef.current.set(`${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`, elevations[i]!);
          }
        });
      }).catch(() => {});
      
      flightTracks.forEach((track, trackIndex) => {
        if (!track.positions || track.positions.length < 2) return;
        
        const latLngs = track.positions.map(p => [p.lat, p.lng] as [number, number]);
        
        // Draw solid green polyline for actual flight track
        const trackLine = L.polyline(latLngs, {
          color: '#22c55e',
          weight: 5,
          opacity: 0.9,
          pane: 'flightTrackPane',
        }).addTo(tracksLayer);
        
        latLngs.forEach(ll => allPoints.push(ll));

        // Click handler on polyline — find nearest point and show telemetry
        trackLine.on('click', (e: L.LeafletMouseEvent) => {
          const clickLatLng = e.latlng;
          let nearestIdx = 0;
          let minDist = Infinity;
          track.positions.forEach((pos, idx) => {
            const dist = clickLatLng.distanceTo(L.latLng(pos.lat, pos.lng));
            if (dist < minDist) { minDist = dist; nearestIdx = idx; }
          });
          const pos = track.positions[nearestIdx];
          const altitude = pos.alt_msl ?? pos.alt ?? null;
          const terrainKey = `${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`;
          const terrainElev = terrainElevationsRef.current.get(terrainKey);
          const aglValue = altitude != null && terrainElev != null ? altitude - terrainElev : null;
          const content = `
            <div style="font-size:12px;line-height:1.5">
              <strong>Punkt ${nearestIdx + 1} av ${track.positions.length}</strong><hr style="margin:4px 0"/>
              ${altitude != null ? `Høyde (MSL): ${Math.round(altitude)} m<br/>` : ''}
              ${aglValue != null ? `<strong>Høyde (AGL): ${Math.round(aglValue)} m</strong><br/>` : ''}
              ${terrainElev != null ? `Terreng: ${Math.round(terrainElev)} m<br/>` : ''}
              ${pos.speed != null ? `Hastighet: ${pos.speed.toFixed(1)} m/s<br/>` : ''}
              ${pos.heading != null ? `Retning: ${Math.round(pos.heading)}°<br/>` : ''}
              ${pos.vert_speed != null ? `Vert. hast.: ${pos.vert_speed.toFixed(1)} m/s<br/>` : ''}
              ${pos.timestamp ? `Tid: ${new Date(pos.timestamp).toLocaleTimeString('nb-NO')}` : ''}
            </div>`;
          L.popup().setLatLng([pos.lat, pos.lng]).setContent(content).openOn(map);
        });

        // Add start marker (green circle)
        const startPos = track.positions[0];
        L.circleMarker([startPos.lat, startPos.lng], {
          radius: 8,
          fillColor: '#22c55e',
          color: '#fff',
          weight: 2,
          fillOpacity: 1,
          pane: 'flightTrackPane',
        }).addTo(tracksLayer).bindPopup(`Flytur ${trackIndex + 1} - Start`);

        // Add end marker (orange circle)
        const endPos = track.positions[track.positions.length - 1];
        L.circleMarker([endPos.lat, endPos.lng], {
          radius: 8,
          fillColor: '#f97316',
          color: '#fff',
          weight: 2,
          fillOpacity: 1,
          pane: 'flightTrackPane',
        }).addTo(tracksLayer).bindPopup(`Flytur ${trackIndex + 1} - Slutt`);
      });
    }

    // Fit bounds to show everything (maxZoom prevents white tiles when points are very close)
    if (allPoints.length > 1) {
      const bounds = L.latLngBounds(allPoints);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 18 });
    }

    // Fetch and display airspace zones
    const zonesLayer = L.layerGroup().addTo(map);

    async function fetchZones() {
      try {
        // NSM zones (red)
        const nsmResponse = await fetch(
          "https://services9.arcgis.com/qCxEdsGu1A7NwfY1/ArcGIS/rest/services/Forbudsomr%c3%a5derNSM_v/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"
        );
        if (nsmResponse.ok) {
          const nsmData = await nsmResponse.json();
          L.geoJSON(nsmData, {
            style: {
              color: '#ef4444',
              weight: 2,
              fillColor: '#ef4444',
              fillOpacity: 0.15,
            },
            onEachFeature: (feature, layer) => {
              const name = feature.properties?.navn || feature.properties?.name || 'NSM Forbudsområde';
              layer.bindPopup(`<strong>NSM</strong><br/>${name}`);
            }
          }).addTo(zonesLayer);
        }

        // RPAS 5km zones (orange)
        const rpasResponse = await fetch(
          "https://services.arcgis.com/a8CwScMFSS2ljjgn/ArcGIS/rest/services/RPAS_AVIGIS1/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"
        );
        if (rpasResponse.ok) {
          const rpasData = await rpasResponse.json();
          L.geoJSON(rpasData, {
            style: {
              color: '#f97316',
              weight: 2,
              fillColor: '#f97316',
              fillOpacity: 0.15,
            },
            onEachFeature: (feature, layer) => {
              const name = feature.properties?.navn || feature.properties?.name || 'RPAS 5km sone';
              layer.bindPopup(`<strong>RPAS 5km</strong><br/>${name}`);
            }
          }).addTo(zonesLayer);
        }

        // RPAS CTR/TIZ zones (pink)
        const ctrResponse = await fetch(
          "https://services.arcgis.com/a8CwScMFSS2ljjgn/ArcGIS/rest/services/RPAS_CTR_TIZ/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"
        );
        if (ctrResponse.ok) {
          const ctrData = await ctrResponse.json();
          L.geoJSON(ctrData, {
            style: {
              color: '#ec4899',
              weight: 2,
              fillColor: '#ec4899',
              fillOpacity: 0.15,
            },
            onEachFeature: (feature, layer) => {
              const name = feature.properties?.navn || feature.properties?.name || 'CTR/TIZ';
              layer.bindPopup(`<strong>RPAS CTR/TIZ</strong><br/>${name}`);
            }
          }).addTo(zonesLayer);
        }
        // AIP ENR 5.1 restriction zones from database
        try {
          const { data: aipZones } = await supabase
            .from('aip_restriction_zones')
            .select('zone_id, zone_type, name, upper_limit, lower_limit, remarks, geometry');

          if (aipZones) {
            for (const zone of aipZones) {
              if (!zone.geometry) continue;
              let color = '#f59e0b';
              let label = 'Fareområde';
              let dashArray: string | undefined = undefined;
              if (zone.zone_type === 'P') { color = '#dc2626'; label = 'Forbudsområde'; }
              else if (zone.zone_type === 'R') { color = '#8b5cf6'; label = 'Restriksjonsområde'; }
              else if (zone.zone_type === 'D') { dashArray = '5, 5'; }
              else if (zone.zone_type === 'RMZ') { color = '#22c55e'; label = 'RMZ'; dashArray = '8, 6'; }
              else if (zone.zone_type === 'TMZ') { color = '#06b6d4'; label = 'TMZ'; dashArray = '8, 6'; }
              else if (zone.zone_type === 'ATZ') { color = '#38bdf8'; label = 'ATZ'; }

              try {
                L.geoJSON({ type: 'Feature', geometry: zone.geometry, properties: {} } as any, {
                  style: {
                    color,
                    weight: 2,
                    fillColor: color,
                    fillOpacity: 0.15,
                    dashArray,
                  },
                  onEachFeature: (feature, layer) => {
                    const displayName = zone.name || zone.zone_id || 'Ukjent';
                    layer.bindPopup(`<strong>${label}</strong><br/><strong>${displayName}</strong><br/>${zone.upper_limit ? 'Øvre: ' + zone.upper_limit : ''}`);
                  }
                }).addTo(zonesLayer);
              } catch {}
            }
          }
        } catch (err) {
          console.error("Feil ved henting av AIP-soner:", err);
        }
      } catch (err) {
        console.error("Feil ved henting av luftromssoner:", err);
      }
    }

    fetchZones();

    // Cleanup
    return () => {
      map.remove();
    };
  }, [latitude, longitude, route, flightTracks]);

  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden border border-border">
      <div ref={mapRef} className="absolute inset-0" />
    </div>
  );
};
