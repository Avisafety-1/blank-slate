import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { openAipConfig } from "@/lib/openaip";
import { supabase } from "@/integrations/supabase/client";
import { MapLayerControl, LayerConfig } from "@/components/MapLayerControl";
import { Button } from "@/components/ui/button";
import { CloudSun, Route, Satellite, Mountain, Map as MapIcon } from "lucide-react";
import airplaneIcon from "@/assets/airplane-icon.png";
import droneAnimatedIcon from "@/assets/drone-animated.gif";
import airportIcon from "@/assets/airport-icon.png";
import { useAuth } from "@/contexts/AuthContext";

const DEFAULT_POS: [number, number] = [63.7, 9.6];

// Generate a unique session ID for heartbeat tracking
const SESSION_ID = crypto.randomUUID();

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface RouteData {
  coordinates: RoutePoint[];
  totalDistance: number;
  areaKm2?: number;
  pilotPosition?: RoutePoint;
  maxDistanceFromPilot?: number;
  pointsOutsideVLOS?: number;
}

interface OpenAIPMapProps {
  onMissionClick?: (mission: any) => void;
  mode?: "view" | "routePlanning";
  existingRoute?: RouteData | null;
  onRouteChange?: (route: RouteData) => void;
  initialCenter?: [number, number];
  controlledRoute?: RouteData | null;
  onStartRoutePlanning?: () => void;
  onPilotPositionChange?: (position: RoutePoint | undefined) => void;
  pilotPosition?: RoutePoint;
  isPlacingPilot?: boolean;
}

// Calculate distance between two points using Haversine formula
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function calculateTotalDistance(points: RoutePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += calculateDistance(
      points[i-1].lat, points[i-1].lng,
      points[i].lat, points[i].lng
    );
  }
  return total;
}

// Compute convex hull using Graham scan algorithm (same as edge function)
function computeConvexHull(points: RoutePoint[]): RoutePoint[] {
  if (points.length < 3) return points;
  
  // Find the point with lowest lat (and leftmost if tie)
  let start = points[0];
  for (const p of points) {
    if (p.lat < start.lat || (p.lat === start.lat && p.lng < start.lng)) {
      start = p;
    }
  }
  
  // Sort by polar angle from start
  const sorted = points.slice().sort((a, b) => {
    if (a === start) return -1;
    if (b === start) return 1;
    const angleA = Math.atan2(a.lng - start.lng, a.lat - start.lat);
    const angleB = Math.atan2(b.lng - start.lng, b.lat - start.lat);
    return angleA - angleB;
  });
  
  // Build hull
  const hull: RoutePoint[] = [];
  for (const p of sorted) {
    while (hull.length >= 2) {
      const a = hull[hull.length - 2];
      const b = hull[hull.length - 1];
      const cross = (b.lat - a.lat) * (p.lng - b.lng) - (b.lng - a.lng) * (p.lat - b.lat);
      if (cross <= 0) {
        hull.pop();
      } else {
        break;
      }
    }
    hull.push(p);
  }
  
  return hull;
}

// Calculate polygon area using Shoelace formula (returns km²)
function calculatePolygonAreaKm2(points: RoutePoint[]): number {
  if (points.length < 3) return 0;
  
  const hull = computeConvexHull(points);
  if (hull.length < 3) return 0;
  
  // Convert to meters using approximate scale at average latitude
  const avgLat = hull.reduce((sum, p) => sum + p.lat, 0) / hull.length;
  const latScale = 111320; // meters per degree latitude
  const lngScale = 111320 * Math.cos(avgLat * Math.PI / 180); // meters per degree longitude
  
  // Apply Shoelace formula
  let area = 0;
  for (let i = 0; i < hull.length; i++) {
    const j = (i + 1) % hull.length;
    const xi = hull[i].lng * lngScale;
    const yi = hull[i].lat * latScale;
    const xj = hull[j].lng * lngScale;
    const yj = hull[j].lat * latScale;
    area += xi * yj - xj * yi;
  }
  
  return Math.abs(area) / 2 / 1_000_000; // Convert m² to km²
}

export function OpenAIPMap({ 
  onMissionClick, 
  mode = "view", 
  existingRoute,
  onRouteChange,
  initialCenter,
  controlledRoute,
  onStartRoutePlanning,
  onPilotPositionChange,
  pilotPosition,
  isPlacingPilot
}: OpenAIPMapProps) {
  const { user } = useAuth();
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);
  const missionsLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const nsmGeoJsonRef = useRef<L.GeoJSON<any> | null>(null);
  const rpasGeoJsonRef = useRef<L.GeoJSON<any> | null>(null);
  const rpasCtrGeoJsonRef = useRef<L.GeoJSON<any> | null>(null);
  const routePointsRef = useRef<RoutePoint[]>(existingRoute?.coordinates || []);
  const pilotMarkerRef = useRef<L.Marker | null>(null);
  const pilotCircleRef = useRef<L.Circle | null>(null);
  const pilotLayerRef = useRef<L.LayerGroup | null>(null);
  const [layers, setLayers] = useState<LayerConfig[]>([]);
  const [weatherEnabled, setWeatherEnabled] = useState(false);
  const [baseLayerType, setBaseLayerType] = useState<'osm' | 'satellite' | 'topo'>('osm');
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const isPlacingPilotRef = useRef(isPlacingPilot);
  const onPilotPositionChangeRef = useRef(onPilotPositionChange);
  const weatherEnabledRef = useRef(false);
  const modeRef = useRef(mode);

  const onMissionClickRef = useRef<typeof onMissionClick>(onMissionClick);
  const onRouteChangeRef = useRef<typeof onRouteChange>(onRouteChange);

  const setGeoJsonInteractivity = useCallback(
    (geoJson: L.GeoJSON<any> | null, enabled: boolean) => {
      if (!geoJson) return;

      (geoJson as any).options = { ...(geoJson as any).options, interactive: enabled };

      geoJson.eachLayer((layer: any) => {
        if (layer?.options) {
          layer.options.interactive = enabled;
          layer.options.bubblingMouseEvents = true;
        }

        const el = typeof layer.getElement === "function" ? layer.getElement() : layer?._path;
        if (el) {
          (el as HTMLElement).style.pointerEvents = enabled ? "auto" : "none";
        }
      });
    },
    []
  );

  // Switch between base map layers
  const switchBaseLayer = useCallback((newType: 'osm' | 'satellite' | 'topo') => {
    if (!leafletMapRef.current || !baseLayerRef.current) return;
    
    const map = leafletMapRef.current;
    map.removeLayer(baseLayerRef.current);
    
    let url: string;
    let attribution: string;
    let subdomains: string | string[] = 'abc';
    
    switch (newType) {
      case 'satellite':
        url = openAipConfig.tiles.satellite;
        attribution = openAipConfig.attribution.satellite;
        subdomains = [];
        break;
      case 'topo':
        url = openAipConfig.tiles.topo;
        attribution = openAipConfig.attribution.topo;
        break;
      default:
        url = openAipConfig.tiles.base;
        attribution = openAipConfig.attribution.osm;
    }
    
    const newLayer = L.tileLayer(url, { attribution, subdomains }).addTo(map);
    newLayer.bringToBack();
    baseLayerRef.current = newLayer;
    setBaseLayerType(newType);
  }, []);

  // Sync refs with state/props for use in event handlers
  useEffect(() => {
    weatherEnabledRef.current = weatherEnabled;
  }, [weatherEnabled]);

  useEffect(() => {
    onMissionClickRef.current = onMissionClick;
  }, [onMissionClick]);

  useEffect(() => {
    onRouteChangeRef.current = onRouteChange;
  }, [onRouteChange]);

  useEffect(() => {
    isPlacingPilotRef.current = isPlacingPilot;
  }, [isPlacingPilot]);

  useEffect(() => {
    onPilotPositionChangeRef.current = onPilotPositionChange;
  }, [onPilotPositionChange]);

  // Update route display
  const updateRouteDisplay = useCallback(() => {
    if (!routeLayerRef.current || !leafletMapRef.current) return;

    routeLayerRef.current.clearLayers();
    const points = routePointsRef.current;

    if (points.length === 0) return;

    // Draw polyline
    if (points.length > 1) {
      const latLngs = points.map((p) => [p.lat, p.lng] as [number, number]);
      L.polyline(latLngs, {
        color: '#3b82f6',
        weight: 3,
        opacity: 0.8,
        dashArray: '10, 5',
        pane: 'routePane',
      }).addTo(routeLayerRef.current);
    }

    // Add numbered markers
    points.forEach((point, index) => {
      const isFirst = index === 0;
      const isLast = index === points.length - 1 && points.length > 1;

      let bgColor = '#3b82f6'; // blue default
      if (isFirst) bgColor = '#22c55e'; // green for start
      else if (isLast) bgColor = '#ef4444'; // red for end

      const marker = L.marker([point.lat, point.lng], {
        icon: L.divIcon({
          className: 'route-marker',
          html: `<div style="
            width: 28px;
            height: 28px;
            background: ${bgColor};
            border: 2px solid white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 12px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            cursor: ${modeRef.current === 'routePlanning' ? 'move' : 'default'};
          ">${index + 1}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        draggable: modeRef.current === 'routePlanning',
        pane: 'routePane',
      });

      if (modeRef.current === 'routePlanning') {
        // Drag to move point
        marker.on('dragend', (e: any) => {
          const { lat, lng } = e.target.getLatLng();
          routePointsRef.current[index] = { lat, lng };
          updateRouteDisplay();

          const cb = onRouteChangeRef.current;
          if (cb) {
            const coords = [...routePointsRef.current];
            cb({
              coordinates: coords,
              totalDistance: calculateTotalDistance(coords),
              areaKm2: calculatePolygonAreaKm2(coords),
            });
          }
        });

        // Right-click to remove point
        marker.on('contextmenu', (e: any) => {
          L.DomEvent.stopPropagation(e);
          routePointsRef.current.splice(index, 1);
          updateRouteDisplay();

          const cb = onRouteChangeRef.current;
          if (cb) {
            const coords = [...routePointsRef.current];
            cb({
              coordinates: coords,
              totalDistance: calculateTotalDistance(coords),
              areaKm2: calculatePolygonAreaKm2(coords),
            });
          }
        });
      }

      // Show distance in popup
      let popupContent = `<strong>Punkt ${index + 1}</strong>`;
      if (index > 0) {
        const dist = calculateDistance(
          points[index - 1].lat,
          points[index - 1].lng,
          point.lat,
          point.lng
        );
        popupContent += `<br/>Avstand fra forrige: ${dist.toFixed(2)} km`;
      }
      if (modeRef.current === 'routePlanning') {
        popupContent +=
          '<br/><em style="font-size: 11px; color: #666;">Dra for å flytte, høyreklikk for å slette</em>';
      }
      marker.bindPopup(popupContent);

      marker.addTo(routeLayerRef.current!);
    });

    // Show total distance on last segment
    if (points.length > 1) {
      const totalDist = calculateTotalDistance(points);
      const midPoint = points[Math.floor(points.length / 2)];
      L.marker([midPoint.lat, midPoint.lng], {
        icon: L.divIcon({
          className: 'route-marker',
          html: `<div style="
            background: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            box-shadow: 0 1px 4px rgba(0,0,0,0.2);
            white-space: nowrap;
          ">Total: ${totalDist.toFixed(2)} km</div>`,
          iconSize: [100, 24],
          iconAnchor: [50, -10],
        }),
        interactive: false,
        pane: 'routePane',
      }).addTo(routeLayerRef.current);
    }
  }, []);

  // Sync mode ref and update route display when mode changes
  useEffect(() => {
    modeRef.current = mode;

    // Ensure vector layers don't block map clicks when in route planning mode
    const vectorsInteractive = mode !== "routePlanning";
    setGeoJsonInteractivity(nsmGeoJsonRef.current, vectorsInteractive);
    setGeoJsonInteractivity(rpasGeoJsonRef.current, vectorsInteractive);
    setGeoJsonInteractivity(rpasCtrGeoJsonRef.current, vectorsInteractive);

    // Disable pointer events on overlay panes when in route planning mode
    // This allows clicks to pass through to the map for adding route points
    if (leafletMapRef.current) {
      const map = leafletMapRef.current;
      const overlayPane = map.getPane("overlayPane");
      if (overlayPane) {
        overlayPane.style.pointerEvents = mode === "routePlanning" ? "none" : "auto";
      }
    }

    // Update route display when mode changes (to update draggable status on markers)
    if (routeLayerRef.current && leafletMapRef.current) {
      updateRouteDisplay();
    }
  }, [mode, updateRouteDisplay, setGeoJsonInteractivity]);

  // Sync with controlled route from parent (for clear/undo operations)
  useEffect(() => {
    if (controlledRoute && controlledRoute.coordinates.length < routePointsRef.current.length) {
      routePointsRef.current = [...controlledRoute.coordinates];
      updateRouteDisplay();
    }
  }, [controlledRoute?.coordinates.length, updateRouteDisplay]);

  useEffect(() => {
    if (!mapRef.current) return;

    const startCenter = initialCenter || DEFAULT_POS;
    const map = L.map(mapRef.current).setView(startCenter, initialCenter ? 13 : 8);
    leafletMapRef.current = map;

    // Create custom pane for route elements with higher z-index
    map.createPane('routePane');
    const routePane = map.getPane('routePane');
    if (routePane) {
      routePane.style.zIndex = '650'; // Above markers (600), below popups (700)
      routePane.style.pointerEvents = 'auto';
    }

    // NSM pane - make sure NSM areas are above RPAS/CTR and clickable
    map.createPane('nsmPane');
    const nsmPane = map.getPane('nsmPane');
    if (nsmPane) {
      nsmPane.style.zIndex = '640';
      nsmPane.style.pointerEvents = 'auto';
    }
    console.log('routePane created:', !!routePane);

    // OSM background
    const osmLayer = L.tileLayer(openAipConfig.tiles.base, {
      attribution: openAipConfig.attribution.osm,
      subdomains: "abc",
    }).addTo(map);
    baseLayerRef.current = osmLayer;

    const layerConfigs: LayerConfig[] = [];

    // OpenAIP airspace
    if (openAipConfig.apiKey && openAipConfig.tiles.airspace) {
      const airspaceUrl = openAipConfig.tiles.airspace.replace("{key}", openAipConfig.apiKey);
      const airspaceLayer = L.tileLayer(airspaceUrl, {
        opacity: 0.55,
        subdomains: "abc",
      }).addTo(map);
      
      layerConfigs.push({
        id: "airspace",
        name: "Luftrom (OpenAIP)",
        layer: airspaceLayer,
        enabled: true,
        icon: "layers",
      });
    }

    // NRL - Luftfartshindre
    const nrlLayer = L.tileLayer.wms(
      "https://wms.geonorge.no/skwms1/wms.nrl5?",
      {
        layers: "nrlflate,nrllinje,nrlluftspenn,nrlmast,nrlpunkt",
        format: "image/png",
        transparent: true,
        opacity: 0.8,
        attribution: 'NRL Luftfartshindre',
      }
    );
    layerConfigs.push({
      id: "nrl",
      name: "Luftfartshindre (NRL)",
      layer: nrlLayer,
      enabled: false,
      icon: "alertTriangle",
    });

    // Naturvern
    const naturvernLayer = L.tileLayer.wms(
      "https://kart.miljodirektoratet.no/arcgis/services/vern_restriksjonsomrader/MapServer/WMSServer?",
      {
        layers: "0",
        format: "image/png",
        transparent: true,
        opacity: 0.7,
        attribution: 'Miljødirektoratet - Verneområder',
      }
    ).addTo(map);
    layerConfigs.push({
      id: "naturvern",
      name: "Naturvern-restriksjoner",
      layer: naturvernLayer,
      enabled: true,
      icon: "treePine",
    });


    // RPAS 5km soner
    const rpasLayer = L.layerGroup().addTo(map);
    layerConfigs.push({
      id: "rpas",
      name: "RPAS 5km soner",
      layer: rpasLayer,
      enabled: true,
      icon: "radio",
    });

    // RPAS CTR/TIZ
    const rpasCtрLayer = L.layerGroup().addTo(map);
    layerConfigs.push({
      id: "rpas_ctr",
      name: "RPAS CTR/TIZ",
      layer: rpasCtрLayer,
      enabled: true,
      icon: "shield",
    });

    // NSM Forbudsområder - added last so it's on top and clickable
    const nsmLayer = L.layerGroup().addTo(map);
    layerConfigs.push({
      id: "nsm",
      name: "NSM Forbudsområder",
      layer: nsmLayer,
      enabled: true,
      icon: "ban",
    });

    // Airports
    const airportsLayer = L.layerGroup().addTo(map);
    layerConfigs.push({
      id: "airports",
      name: "Flyplasser",
      layer: airportsLayer,
      enabled: true,
      icon: "planeLanding",
    });

    // Geolocation
    if (!initialCenter && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          map.setView(coords, 9);
          
          if (userMarkerRef.current) {
            userMarkerRef.current.setLatLng(coords);
          } else {
            userMarkerRef.current = L.circleMarker(coords, {
              radius: 8,
              fillColor: '#3b82f6',
              fillOpacity: 1,
              color: '#ffffff',
              weight: 2,
            }).addTo(map);
            userMarkerRef.current.bindPopup("Din posisjon");
          }
        },
        () => console.log("Geolokasjon nektet"),
      );
    }

    // Drone telemetry layer
    const droneLayer = L.layerGroup().addTo(map);
    layerConfigs.push({
      id: "drones",
      name: "Droner (live)",
      layer: droneLayer,
      enabled: true,
      icon: "navigation",
    });

    // Missions layer - only in view mode
    const missionsLayer = L.layerGroup();
    if (modeRef.current === "view") {
      missionsLayer.addTo(map);
    }
    missionsLayerRef.current = missionsLayer;
    layerConfigs.push({
      id: "missions",
      name: "Oppdrag",
      layer: missionsLayer,
      enabled: modeRef.current === "view",
      icon: "mapPin",
    });

    // SafeSky / Lufttrafikk layer - renamed from "SafeSky (live)" to "Lufttrafikk (live)"
    const safeskyLayer = L.layerGroup().addTo(map);
    layerConfigs.push({
      id: "safesky",
      name: "Lufttrafikk (live)",
      layer: safeskyLayer,
      enabled: true,
      icon: "radar",
    });

    // Route layer for route planning
    const routeLayer = L.layerGroup().addTo(map);
    routeLayerRef.current = routeLayer;

    // Pilot VLOS layer for route planning mode
    const pilotLayer = L.layerGroup().addTo(map);
    pilotLayerRef.current = pilotLayer;

    // Active advisory areas layer - always visible when active flights exist (not toggleable)
    const activeAdvisoryLayer = L.layerGroup().addTo(map);

    // Pilot positions layer - shows live_uav pilot positions internally
    const pilotPositionsLayer = L.layerGroup().addTo(map);

    setLayers(layerConfigs);

    // Fetch drone telemetry from database
    async function fetchDroneTelemetry() {
      try {
        const { data: telemetry, error } = await supabase
          .from('drone_telemetry')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error || !telemetry) return;
        
        droneLayer.clearLayers();
        
        // Group by drone_id, take only latest position per drone
        const latestByDrone = new Map<string, typeof telemetry[0]>();
        telemetry.forEach(t => {
          const droneId = t.drone_id || 'unknown';
          if (!latestByDrone.has(droneId)) {
            latestByDrone.set(droneId, t);
          }
        });
        
        latestByDrone.forEach((t, droneId) => {
          if (!t.lat || !t.lon) return;
          
          const icon = L.divIcon({
            className: '',
            html: `<img src="${droneAnimatedIcon}" style="width:70px;height:70px;" />`,
            iconSize: [70, 70],
            iconAnchor: [35, 35],
            popupAnchor: [0, -35],
          });
          
          const marker = L.marker([t.lat, t.lon], { icon, interactive: modeRef.current !== 'routePlanning' });
          const updatedTime = t.created_at ? new Date(t.created_at).toLocaleTimeString('no-NO') : 'Ukjent';
          marker.bindPopup(`
            <div>
              <strong>🛸 ${droneId}</strong><br/>
              Høyde: ${t.alt ?? '?'} m<br/>
              Oppdatert: ${updatedTime}
            </div>
          `);
          marker.addTo(droneLayer);
        });
      } catch (err) {
        console.error('Feil ved henting av dronetelemetri:', err);
      }
    }

    // SafeSky markers cache for efficient updates
    const safeskyMarkersCache = new Map<string, L.Marker>();
    
    // SafeSky render function - updates existing markers or creates new ones
    function renderSafeSkyBeacons(beacons: any[]) {
      const currentIds = new Set<string>();
      console.log(`SafeSky: ${beacons.length} beacons from database`);
      
      for (const beacon of beacons) {
        const lat = beacon.latitude;
        const lon = beacon.longitude;
        if (lat == null || lon == null) continue;
        
        const beaconId = beacon.id || `${lat}_${lon}`;
        currentIds.add(beaconId);
        
        // Color based on beacon type
        let bgColor = '#6b7280'; // gray default
        const beaconType = (beacon.beacon_type || '').toLowerCase();
        if (beaconType.includes('plane') || beaconType.includes('aircraft') || beaconType === '1') {
          bgColor = '#3b82f6'; // blue for aircraft
        } else if (beaconType.includes('helicopter') || beaconType.includes('heli') || beaconType === '2') {
          bgColor = '#22c55e'; // green for helicopter
        } else if (beaconType.includes('drone') || beaconType.includes('uav') || beaconType === '8') {
          bgColor = '#8b5cf6'; // purple for drone
        } else if (beaconType.includes('paraglider') || beaconType.includes('hang') || beaconType === '4') {
          bgColor = '#f97316'; // orange for paraglider
        } else if (beaconType.includes('balloon') || beaconType === '5') {
          bgColor = '#ec4899'; // pink for balloon
        }
        
        // Check if altitude > 2000ft (610m) for high altitude styling
        const altitudeMetersForColor = beacon.altitude;
        const isHighAltitude = altitudeMetersForColor != null && altitudeMetersForColor > 610;
        
        // Override to black if high altitude
        if (isHighAltitude) {
          bgColor = '#000000'; // black for high altitude
        }
        
        const course = beacon.course || 0;
        
        // Choose SVG based on beacon type
        const isDrone = beaconType.includes('drone') || beaconType.includes('uav') || beaconType === '8';
        const isHelicopter = beaconType.includes('helicopter') || beaconType.includes('heli') || beaconType === '2';
        
        // Check if marker already exists
        const existingMarker = safeskyMarkersCache.get(beaconId);
        
        if (existingMarker) {
          // Update position of existing marker (smooth update, no flicker)
          existingMarker.setLatLng([lat, lon]);
          
          // Update popup content
          const callsign = beacon.callsign || 'Ukjent';
          const altitudeMeters = beacon.altitude;
          const altitudeFt = altitudeMeters != null ? Math.round(altitudeMeters * 3.28084) : '?';
          const speedMs = beacon.ground_speed;
          const speedKt = speedMs != null ? Math.round(speedMs * 1.94384) : '?';
          const typeLabel = beacon.beacon_type || 'Ukjent';
          
          existingMarker.setPopupContent(`
            <div>
              <strong>Callsign: ${callsign}</strong><br/>
              Type: ${typeLabel}<br/>
              Høyde: ${altitudeFt} ft<br/>
              Fart: ${speedKt} kt<br/>
              <span style="font-size: 10px; color: #888;">Via SafeSky</span>
            </div>
          `);
          
          // Update rotation for aircraft (not drones - they use animated gif)
          if (!isDrone && !isHelicopter) {
            const el = existingMarker.getElement();
            if (el) {
              const img = el.querySelector('img');
              if (img) {
                img.style.transform = `rotate(${course}deg)`;
              }
            }
          }
        } else {
          // Create new marker
          let icon;
          if (isDrone) {
            // Use animated GIF drone icon for drones
            icon = L.divIcon({
              className: '',
              html: `<img src="${droneAnimatedIcon}" style="width:62px;height:62px;" />`,
              iconSize: [62, 62],
              iconAnchor: [31, 31],
              popupAnchor: [0, -31],
            });
          } else if (isHelicopter) {
            // Helicopter icon as colored div with SVG
            icon = L.divIcon({
              className: '',
              html: `<div style="
                width: 28px;
                height: 28px;
                background: ${bgColor};
                border: 2px solid white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                transform: rotate(${course}deg);
              ">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1">
                  <ellipse cx="12" cy="14" rx="6" ry="4"/>
                  <line x1="4" y1="8" x2="20" y2="8" stroke-width="2"/>
                  <line x1="12" y1="8" x2="12" y2="10"/>
                  <line x1="18" y1="14" x2="22" y2="18" stroke-width="2"/>
                </svg>
              </div>`,
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            });
          } else {
            // Use airplane PNG icon for aircraft with rotation
            // Apply grayscale + brightness filter for high altitude (black appearance)
            const highAltFilter = isHighAltitude ? 'filter:grayscale(100%) brightness(0);' : '';
            icon = L.divIcon({
              className: '',
              html: `<img src="${airplaneIcon}" style="width:32px;height:32px;transform:rotate(${course}deg);${highAltFilter}" />`,
              iconSize: [32, 32],
              iconAnchor: [16, 16],
              popupAnchor: [0, -16],
            });
          }
          
          const marker = L.marker([lat, lon], { icon, interactive: mode !== 'routePlanning' });
          
          const callsign = beacon.callsign || 'Ukjent';
          const altitudeMeters = beacon.altitude;
          const altitudeFt = altitudeMeters != null ? Math.round(altitudeMeters * 3.28084) : '?';
          const speedMs = beacon.ground_speed;
          const speedKt = speedMs != null ? Math.round(speedMs * 1.94384) : '?';
          const typeLabel = beacon.beacon_type || 'Ukjent';
          
          marker.bindPopup(`
            <div>
              <strong>Callsign: ${callsign}</strong><br/>
              Type: ${typeLabel}<br/>
              Høyde: ${altitudeFt} ft<br/>
              Fart: ${speedKt} kt<br/>
              <span style="font-size: 10px; color: #888;">Via SafeSky</span>
            </div>
          `);
          marker.addTo(safeskyLayer);
          safeskyMarkersCache.set(beaconId, marker);
        }
      }
      
      // Remove markers that are no longer present
      for (const [id, marker] of safeskyMarkersCache) {
        if (!currentIds.has(id)) {
          safeskyLayer.removeLayer(marker);
          safeskyMarkersCache.delete(id);
        }
      }
    }

    // Fetch SafeSky beacons from database
    async function fetchSafeSkyBeacons() {
      try {
        const { data, error } = await supabase
          .from('safesky_beacons')
          .select('*');
        
        if (error) {
          console.error('SafeSky database error:', error);
          return;
        }
        
        renderSafeSkyBeacons(data || []);
      } catch (err) {
        console.error('Feil ved henting av SafeSky data:', err);
      }
    }

    // Fetch and display active advisory areas from active_flights with publish_mode='advisory'
    // Uses route_data directly from active_flights instead of joining with missions
    // to avoid exposing mission data across companies
    async function fetchActiveAdvisories() {
      try {
        const { data: activeFlights, error } = await supabase
          .from('active_flights')
          .select('id, mission_id, publish_mode, route_data')
          .eq('publish_mode', 'advisory');
        
        if (error) {
          console.error('Error fetching active advisories:', error);
          return;
        }
        
        activeAdvisoryLayer.clearLayers();
        
        for (const flight of activeFlights || []) {
          const route = flight.route_data as any;
          
          // Skip if no valid route with at least 3 points to form a polygon
          if (!route?.coordinates || route.coordinates.length < 3) continue;
          
          // Build polygon from route coordinates
          const polygonCoords = route.coordinates.map((p: any) => [p.lat, p.lng] as [number, number]);
          
          // Draw semi-transparent emerald polygon (similar to SafeSky app)
          const polygon = L.polygon(polygonCoords, {
            color: '#10b981',        // Emerald border
            weight: 2,
            fillColor: '#10b981',    // Emerald fill
            fillOpacity: 0.25,       // Semi-transparent
            interactive: true,
          });
          
          // Popup with flight info - no mission title shown for cross-company privacy
          polygon.bindPopup(`
            <div>
              <strong>🛸 Aktiv flytur</strong><br/>
              <span style="color: #10b981; font-size: 11px;">Advisory publisert til SafeSky</span>
            </div>
          `);
          
          polygon.addTo(activeAdvisoryLayer);
        }
      } catch (err) {
        console.error('Error fetching active advisories:', err);
      }
    }

    // Fetch and display pilot positions from active_flights with publish_mode='live_uav'
    // These are internal positions (not published to SafeSky) for tracking pilots
    async function fetchPilotPositions() {
      try {
        const { data: liveFlights, error } = await supabase
          .from('active_flights')
          .select('id, start_lat, start_lng, pilot_name, start_time')
          .eq('publish_mode', 'live_uav')
          .not('start_lat', 'is', null)
          .not('start_lng', 'is', null);
        
        if (error) {
          console.error('Error fetching pilot positions:', error);
          return;
        }
        
        pilotPositionsLayer.clearLayers();
        
        for (const flight of liveFlights || []) {
          if (!flight.start_lat || !flight.start_lng) continue;
          
          // Create pilot marker with person icon
          const pilotIcon = L.divIcon({
            className: '',
            html: `<div style="
              width: 32px;
              height: 32px;
              background: #0ea5e9;
              border: 3px solid white;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            ">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1">
                <circle cx="12" cy="7" r="4"/>
                <path d="M5.5 21a9.5 9.5 0 0 1 13 0"/>
              </svg>
            </div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popupAnchor: [0, -16],
          });
          
          const marker = L.marker([flight.start_lat, flight.start_lng], { 
            icon: pilotIcon, 
            interactive: mode !== 'routePlanning' 
          });
          
          const startTime = flight.start_time ? new Date(flight.start_time).toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' }) : 'Ukjent';
          const pilotName = flight.pilot_name || 'Ukjent pilot';
          
          marker.bindPopup(`
            <div>
              <strong>👤 ${pilotName}</strong><br/>
              <span style="font-size: 11px; color: #666;">Pilot (live posisjon)</span><br/>
              <span style="font-size: 11px;">Startet: ${startTime}</span>
            </div>
          `);
          
          marker.addTo(pilotPositionsLayer);
        }
        
        console.log(`Rendered ${liveFlights?.length || 0} pilot positions`);
      } catch (err) {
        console.error('Error fetching pilot positions:', err);
      }
    }

    // Data fetching functions
    async function fetchNsmData() {
      try {
        const url = "https://services9.arcgis.com/qCxEdsGu1A7NwfY1/ArcGIS/rest/services/Forbudsomr%c3%a5derNSM_v/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson";
        const response = await fetch(url);
        if (!response.ok) return;

        const geojson = await response.json();
        const geoJsonLayer = L.geoJSON(geojson, {
          pane: 'nsmPane',
          interactive: mode !== 'routePlanning',
          style: {
            color: '#ff0000',
            weight: 2,
            fillColor: '#ff0000',
            fillOpacity: 0.25,
          },
          onEachFeature: mode !== 'routePlanning' ? (feature, layer) => {
            const props = feature?.properties || {};
            const name =
              props.navn ||
              props.NAVN ||
              props.name ||
              props.Name ||
              props.OMR_NAVN ||
              props.OMRNAVN ||
              props.OBJECTID ||
              'Ukjent område';

            const excludeKeys = ['globalid', 'shape_area', 'shape__area', 'shape_length', 'shape__length', 'shape_lenght', 'objectid', 'refnr', 'length'];
            const details = Object.entries(props)
              .filter(([k, v]) => v !== null && v !== undefined && String(v).trim() !== '' && !excludeKeys.includes(k.trim().toLowerCase()))
              .slice(0, 8)
              .map(([k, v]) => `<div style="font-size: 11px;"><span style="color:#666;">${k}:</span> ${String(v)}</div>`)
              .join('');

            layer.bindPopup(
              `<div>
                <strong>NSM Forbudsområde</strong><br/>
                <span>${String(name)}</span>
                ${details ? `<div style="margin-top:6px;">${details}</div>` : ''}
              </div>`
            );
          } : undefined,
        });

        // Keep a ref so we can toggle interactivity when switching to route planning
        nsmGeoJsonRef.current = geoJsonLayer;
        setGeoJsonInteractivity(geoJsonLayer, modeRef.current !== "routePlanning");

        // Ensure NSM stays above other vector overlays
        (geoJsonLayer as any).bringToFront?.();
        geoJsonLayer.eachLayer((l: any) => l?.bringToFront?.());

        nsmLayer.clearLayers();
        nsmLayer.addLayer(geoJsonLayer);
      } catch (err) {
        console.error("Kunne ikke hente NSM Forbudsområder:", err);
      }
    }

    async function fetchRpasData() {
      try {
        const url = "https://services.arcgis.com/a8CwScMFSS2ljjgn/ArcGIS/rest/services/RPAS_AVIGIS1/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson";
        const response = await fetch(url);
        if (!response.ok) return;
        
        const geojson = await response.json();
        const geoJsonLayer = L.geoJSON(geojson, {
          interactive: mode !== 'routePlanning',
          style: {
            color: '#f97316',
            weight: 2,
            fillColor: '#f97316',
            fillOpacity: 0.2,
          },
          onEachFeature: mode !== 'routePlanning' ? (feature, layer) => {
            if (feature.properties) {
              const name = feature.properties.navn || feature.properties.name || 'Ukjent';
              layer.bindPopup(`<strong>RPAS 5km sone</strong><br/>${name}`);
            }
          } : undefined
        });

        // Make sure the layer doesn't block adding route points when switching mode
        rpasGeoJsonRef.current = geoJsonLayer;
        setGeoJsonInteractivity(geoJsonLayer, modeRef.current !== "routePlanning");
        
        rpasLayer.clearLayers();
        rpasLayer.addLayer(geoJsonLayer);
      } catch (err) {
        console.error("Kunne ikke hente RPAS 5km soner:", err);
      }
    }

    async function fetchRpasCtрData() {
      try {
        const url = "https://services.arcgis.com/a8CwScMFSS2ljjgn/ArcGIS/rest/services/RPAS_CTR_TIZ/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson";
        const response = await fetch(url);
        if (!response.ok) return;
        
        const geojson = await response.json();
        const geoJsonLayer = L.geoJSON(geojson, {
          interactive: mode !== 'routePlanning',
          style: {
            color: '#ec4899',
            weight: 2,
            fillColor: '#ec4899',
            fillOpacity: 0.2,
          },
          onEachFeature: mode !== 'routePlanning' ? (feature, layer) => {
            if (feature.properties) {
              const name = feature.properties.navn || feature.properties.name || 'Ukjent';
              layer.bindPopup(`<strong>RPAS CTR/TIZ</strong><br/>${name}`);
            }
          } : undefined
        });

        // Make sure the layer doesn't block adding route points when switching mode
        rpasCtrGeoJsonRef.current = geoJsonLayer;
        setGeoJsonInteractivity(geoJsonLayer, modeRef.current !== "routePlanning");
        
        rpasCtрLayer.clearLayers();
        rpasCtрLayer.addLayer(geoJsonLayer);
      } catch (err) {
        console.error("Kunne ikke hente RPAS CTR/TIZ soner:", err);
      }
    }

    async function fetchAirportsData() {
      try {
        const url = "https://services.arcgis.com/a8CwScMFSS2ljjgn/ArcGIS/rest/services/FlyplassInfo_PROD/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson";
        const response = await fetch(url);
        if (!response.ok) return;
        
        const geojson = await response.json();
        const geoJsonLayer = L.geoJSON(geojson, {
          pointToLayer: (feature, latlng) => {
            const icon = L.icon({
              iconUrl: airportIcon,
              iconSize: [32, 40],
              iconAnchor: [16, 40],
              popupAnchor: [0, -40]
            });
            return L.marker(latlng, { icon, interactive: mode !== 'routePlanning' });
          },
          onEachFeature: mode !== 'routePlanning' ? (feature, layer) => {
            if (feature.properties) {
              const props = feature.properties;
              const icao = props.ICAO || props.icao || '';
              const iata = props.IATA || props.iata || '';
              const name = props.NAVN || props.navn || props.name || props.Name || icao || 'Flyplass';
              
              let popupContent = `<strong>${name}</strong>`;
              if (icao) popupContent += `<br/>ICAO: ${icao}`;
              if (iata) popupContent += `<br/>IATA: ${iata}`;
              
              layer.bindPopup(popupContent);
            }
          } : undefined
        });
        
        airportsLayer.clearLayers();
        airportsLayer.addLayer(geoJsonLayer);
      } catch (err) {
        console.error("Kunne ikke hente flyplasser:", err);
      }
    }

    async function fetchAndDisplayMissions() {
      if (modeRef.current !== "view") return;
      
      try {
        const { data: missions, error } = await supabase
          .from("missions")
          .select("*")
          .not("latitude", "is", null)
          .not("longitude", "is", null);

        if (error || !missionsLayerRef.current) return;
        
        missionsLayerRef.current.clearLayers();

        missions?.forEach((mission) => {
          if (!mission.latitude || !mission.longitude) return;

          let markerColor = '#3b82f6';
          if (mission.status === 'Pågående') markerColor = '#eab308';
          else if (mission.status === 'Fullført') markerColor = '#6b7280';
          
          const icon = L.divIcon({
            className: '',
            html: `<div style="
              width: 32px;
              height: 32px;
              display: flex;
              align-items: center;
              justify-content: center;
              filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
            ">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${markerColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                <circle cx="12" cy="10" r="3" fill="${markerColor}"/>
              </svg>
            </div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 32],
          });

          const marker = L.marker([mission.latitude, mission.longitude], { icon });
          marker.on('click', () => {
            onMissionClickRef.current?.(mission);
          });
          marker.addTo(missionsLayerRef.current!);
        });
      } catch (err) {
        console.error("Feil ved henting av oppdrag:", err);
      }
    }

    // Map click handler - different behavior for route planning vs view mode
    const handleMapClick = async (e: any) => {
      // Don't handle clicks that originated from markers or popups
      if (e.originalEvent?.target?.closest('.leaflet-marker-icon, .leaflet-popup, .leaflet-popup-content-wrapper')) {
        return;
      }
      
      const { lat, lng } = e.latlng;
      
      // Check if we're placing pilot position
      if (isPlacingPilotRef.current) {
        const cb = onPilotPositionChangeRef.current;
        if (cb) {
          cb({ lat, lng });
        }
        return;
      }
      
      if (modeRef.current === "routePlanning") {
        // Add point to route
        routePointsRef.current.push({ lat, lng });
        updateRouteDisplay();

        const cb = onRouteChangeRef.current;
        if (cb) {
          const coords = [...routePointsRef.current];
          cb({
            coordinates: coords,
            totalDistance: calculateTotalDistance(coords),
            areaKm2: calculatePolygonAreaKm2(coords),
          });
        }
      } else if (weatherEnabledRef.current) {
        // Show weather popup only when weather is enabled
        const popup = L.popup()
          .setLatLng([lat, lng])
          .setContent(`
            <div style="min-width: 280px; padding: 8px;">
              <div style="font-weight: 600; margin-bottom: 8px; font-size: 14px;">
                Dronevær for valgt posisjon
              </div>
              <div style="font-size: 12px; color: #666; margin-bottom: 12px;">
                Koordinater: ${lat.toFixed(4)}, ${lng.toFixed(4)}
              </div>
              <div id="weather-content-${Date.now()}" style="text-align: center; padding: 12px;">
                <div style="display: inline-block; width: 16px; height: 16px; border: 2px solid #3b82f6; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <div style="margin-top: 8px; font-size: 12px; color: #666;">Laster værdata...</div>
              </div>
              <style>
                @keyframes spin {
                  to { transform: rotate(360deg); }
                }
              </style>
            </div>
          `)
          .openOn(map);
        
        try {
          const { data, error } = await supabase.functions.invoke('drone-weather', {
            body: { lat, lon: lng }
          });
          
          const contentEl = document.querySelector(`[id^="weather-content-"]`) as HTMLElement;
          if (!contentEl) return;
          
          if (error || !data) {
            contentEl.innerHTML = '<div style="color: #dc2626; padding: 8px;">Kunne ikke hente værdata</div>';
            return;
          }
          
          const recommendation = data.drone_flight_recommendation;
          const recommendationColors: Record<string, any> = {
            warning: { bg: '#fee2e2', border: '#dc2626', color: '#dc2626' },
            caution: { bg: '#fef3c7', border: '#f59e0b', color: '#f59e0b' },
            ok: { bg: '#d1fae5', border: '#10b981', color: '#10b981' },
          };
          const colors = recommendationColors[recommendation] || { bg: '#f3f4f6', border: '#9ca3af', color: '#6b7280' };
          
          const recommendationText: Record<string, string> = {
            warning: 'Anbefales ikke å fly',
            caution: 'Fly med forsiktighet',
            ok: 'Gode flyforhold',
          };
          
          let html = `
            <div style="padding: 8px; background: ${colors.bg}; border: 1px solid ${colors.border}; border-radius: 6px; margin-bottom: 12px;">
              <div style="color: ${colors.color}; font-weight: 600; font-size: 13px;">
                ${recommendationText[recommendation] || 'Ukjent'}
              </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 12px; margin-bottom: 12px;">
              <div>
                <div style="color: #6b7280; font-size: 11px;">Vind</div>
                <div style="font-weight: 600;">${data.current.wind_speed?.toFixed(1) || '-'} m/s</div>
              </div>
              <div>
                <div style="color: #6b7280; font-size: 11px;">Temp</div>
                <div style="font-weight: 600;">${data.current.temperature?.toFixed(1) || '-'}°C</div>
              </div>
              <div>
                <div style="color: #6b7280; font-size: 11px;">Nedbør</div>
                <div style="font-weight: 600;">${data.current.precipitation?.toFixed(1) || '0'} mm</div>
              </div>
            </div>
          `;
          
          if (data.warnings && data.warnings.length > 0) {
            html += '<div style="margin-top: 12px; font-size: 11px;">';
            data.warnings.forEach((w: any) => {
              const wColors: Record<string, any> = {
                warning: { bg: '#fee2e2', border: '#dc2626' },
                caution: { bg: '#fef3c7', border: '#f59e0b' },
                note: { bg: '#dbeafe', border: '#3b82f6' },
              };
              const wColor = wColors[w.level] || wColors.note;
              html += `<div style="padding: 6px; background: ${wColor.bg}; border-left: 3px solid ${wColor.border}; margin-bottom: 6px; border-radius: 3px;">${w.message}</div>`;
            });
            html += '</div>';
          }
          
          // Timeprognose for de neste 12 timene
          if (data.hourly_forecast && data.hourly_forecast.length > 0) {
            const forecast = data.hourly_forecast.slice(0, 12);
            const recColors: Record<string, string> = {
              ok: '#10b981',
              caution: '#f59e0b',
              warning: '#dc2626',
            };
            const recTexts: Record<string, string> = {
              ok: 'Gode flyforhold',
              caution: 'Fly med forsiktighet',
              warning: 'Anbefales ikke å fly',
            };
            
            // Genererer årsak til anbefaling
            const getReasons = (h: any) => {
              const reasons: string[] = [];
              const windSpeed = h.wind_speed || 0;
              const windGust = h.wind_gust || 0;
              const precipitation = h.precipitation || 0;
              const temperature = h.temperature || 0;
              const symbol = h.symbol || '';
              
              if (windSpeed > 10) reasons.push(`Sterk vind (${windSpeed.toFixed(1)} m/s)`);
              if (windGust > 15) reasons.push(`Kraftige vindkast (${windGust.toFixed(1)} m/s)`);
              if (precipitation > 2) reasons.push(`Kraftig nedbør (${precipitation.toFixed(1)} mm)`);
              if (temperature < -10 || temperature > 40) reasons.push(`Ekstrem temperatur (${temperature.toFixed(0)}°C)`);
              if (symbol.includes('fog')) reasons.push('Tåke');
              
              if (reasons.length === 0) {
                if (windSpeed > 7) reasons.push(`Mye vind (${windSpeed.toFixed(1)} m/s)`);
                if (windGust > 10) reasons.push(`Vindkast (${windGust.toFixed(1)} m/s)`);
                if (precipitation > 0.5) reasons.push(`Nedbør (${precipitation.toFixed(1)} mm)`);
                if (temperature < 0) reasons.push(`Kulde (${temperature.toFixed(0)}°C)`);
              }
              return reasons;
            };
            
            const popupId = `forecast-popup-${Date.now()}`;
            
            // Lagre forecast-data i window for tilgang fra onclick
            const forecastDataId = `forecastData_${Date.now()}`;
            (window as any)[forecastDataId] = forecast.map((h: any, i: number) => {
              const hour = new Date(h.time).getHours().toString().padStart(2, '0');
              const reasons = getReasons(h);
              return {
                hour,
                temp: h.temperature?.toFixed(1) || '-',
                wind: h.wind_speed?.toFixed(1) || '-',
                windGust: h.wind_gust?.toFixed(1) || null,
                precip: h.precipitation?.toFixed(1) || '0',
                recommendation: h.recommendation,
                recText: recTexts[h.recommendation] || '',
                color: recColors[h.recommendation] || '#9ca3af',
                reasons,
              };
            });
            
            html += `
              <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
                <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 8px;">
                  <div style="font-size: 11px; font-weight: 600; color: #6b7280; line-height: 1.3;">Prognose neste<br/>12 timer</div>
                  <div style="display: flex; gap: 6px; font-size: 9px; color: #9ca3af;">
                    <span style="display: flex; align-items: center; gap: 2px;"><span style="width: 8px; height: 8px; background: #10b981; border-radius: 2px;"></span>OK</span>
                    <span style="display: flex; align-items: center; gap: 2px;"><span style="width: 8px; height: 8px; background: #f59e0b; border-radius: 2px;"></span>Forsiktig</span>
                    <span style="display: flex; align-items: center; gap: 2px;"><span style="width: 8px; height: 8px; background: #dc2626; border-radius: 2px;"></span>Ikke fly</span>
                  </div>
                </div>
                <div id="${popupId}-container" style="display: flex; gap: 2px; position: relative;">
                  ${forecast.map((h: any, i: number) => {
                    const hour = new Date(h.time).getHours().toString().padStart(2, '0');
                    const color = recColors[h.recommendation] || '#9ca3af';
                    return `
                      <div 
                        class="forecast-block-${popupId}" 
                        data-index="${i}"
                        data-forecast-id="${forecastDataId}"
                        data-popup-id="${popupId}"
                        style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; cursor: pointer; position: relative;"
                      >
                        <div style="width: 100%; height: 16px; background: ${color}; border-radius: 3px; transition: transform 0.1s;" onmouseover="this.style.transform='scaleY(1.2)'" onmouseout="this.style.transform='scaleY(1)'"></div>
                        <span style="font-size: 8px; color: #9ca3af;">${hour}</span>
                      </div>
                    `;
                  }).join('')}
                  <div id="${popupId}" style="display: none; position: absolute; z-index: 9999; pointer-events: auto;"></div>
                </div>
              </div>
            `;
            
            // Beste flyvindu
            if (data.best_flight_window) {
              const startTime = new Date(data.best_flight_window.start_time).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
              const endTime = new Date(data.best_flight_window.end_time).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
              html += `
                <div style="margin-top: 8px; display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 500;">
                  <span style="color: #10b981;">✨</span>
                  <span>Beste flyvindu: ${startTime} - ${endTime} (${data.best_flight_window.duration_hours}t)</span>
                </div>
              `;
            }
            
            // Legg til event listeners etter HTML er satt
            setTimeout(() => {
              const blocks = document.querySelectorAll(`.forecast-block-${popupId}`);
              blocks.forEach((block) => {
                block.addEventListener('click', function(this: HTMLElement) {
                  const idx = parseInt(this.dataset.index || '0');
                  const dataId = this.dataset.forecastId || '';
                  const popId = this.dataset.popupId || '';
                  const forecastArr = (window as any)[dataId];
                  if (!forecastArr) return;
                  
                  const h = forecastArr[idx];
                  const popupEl = document.getElementById(popId);
                  if (!popupEl) return;
                  
                  if (popupEl.style.display === 'block' && popupEl.dataset.activeIndex === String(idx)) {
                    popupEl.style.display = 'none';
                    return;
                  }
                  
                  let reasonsHtml = '';
                  if (h.recommendation !== 'ok' && h.reasons.length > 0) {
                    reasonsHtml = `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #e5e7eb; color: ${h.color}; font-size: 10px; font-weight: 500;">${h.recText}<ul style="margin: 4px 0 0 14px; padding: 0; font-weight: 400;">${h.reasons.map((r: string) => `<li style="margin-bottom: 2px;">${r}</li>`).join('')}</ul></div>`;
                  } else if (h.recommendation === 'ok') {
                    reasonsHtml = `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #e5e7eb; color: #10b981; font-size: 10px; font-weight: 500;">Gode flyforhold</div>`;
                  }
                  
                  popupEl.innerHTML = `
                    <div style="padding: 10px; background: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-size: 12px; min-width: 160px; border: 1px solid #e5e7eb;">
                      <div style="font-weight: 600; margin-bottom: 8px; font-size: 13px;">${h.hour}:00</div>
                      <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                        <span>🌡️</span><span>${h.temp}°C</span>
                      </div>
                      <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                        <span>💨</span><span>${h.wind} m/s${h.windGust ? ` (kast ${h.windGust})` : ''}</span>
                      </div>
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <span>💧</span><span>${h.precip} mm</span>
                      </div>
                      ${reasonsHtml}
                    </div>
                  `;
                  popupEl.dataset.activeIndex = String(idx);
                  popupEl.style.display = 'block';
                  
                  // Posisjonering - plasser rett over den klikkede boksen
                  const blockRect = this.getBoundingClientRect();
                  const container = document.getElementById(`${popId}-container`);
                  if (container) {
                    const containerRect = container.getBoundingClientRect();
                    const popupWidth = 160;
                    let leftPos = blockRect.left - containerRect.left + blockRect.width / 2 - popupWidth / 2;
                    
                    // Sørg for at popup ikke går utenfor containeren
                    if (leftPos < 0) leftPos = 0;
                    if (leftPos + popupWidth > containerRect.width) leftPos = containerRect.width - popupWidth;
                    
                    popupEl.style.left = `${leftPos}px`;
                    popupEl.style.bottom = `calc(100% + 4px)`;
                    popupEl.style.transform = 'none';
                  }
                });
              });
            }, 100);
          }
          
          html += '<div style="margin-top: 12px; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px;">Værdata fra MET Norway</div>';
          
          contentEl.innerHTML = html;
        } catch (err) {
          console.error('Error fetching weather in map popup:', err);
          const contentEl = document.querySelector(`[id^="weather-content-"]`) as HTMLElement;
          if (contentEl) {
            contentEl.innerHTML = '<div style="color: #dc2626; padding: 8px;">Feil ved henting av værdata</div>';
          }
        }
      }
    };

    map.on('click', handleMapClick);

    fetchNsmData();
    fetchRpasData();
    fetchRpasCtрData();
    fetchAirportsData();
    fetchDroneTelemetry();
    fetchAndDisplayMissions();
    fetchActiveAdvisories();
    fetchPilotPositions();

    const droneInterval = setInterval(fetchDroneTelemetry, 5000);

    // === HEARTBEAT SYSTEM ===
    // Sends heartbeat to database so backend knows to fetch beacons
    let heartbeatInterval: number | undefined;
    
    const sendHeartbeat = async () => {
      try {
        const { error } = await supabase
          .from('map_viewer_heartbeats')
          .upsert({
            session_id: SESSION_ID,
            user_id: user?.id || null,
            last_seen: new Date().toISOString(),
          }, { onConflict: 'session_id' });
        
        if (error) {
          console.error('Heartbeat error:', error);
        }
      } catch (err) {
        console.error('Heartbeat failed:', err);
      }
    };
    
    const deleteHeartbeat = async () => {
      try {
        await supabase
          .from('map_viewer_heartbeats')
          .delete()
          .eq('session_id', SESSION_ID);
      } catch (err) {
        console.error('Failed to delete heartbeat:', err);
      }
    };
    
    // Send initial heartbeat and start interval
    sendHeartbeat();
    heartbeatInterval = window.setInterval(sendHeartbeat, 5000);
    
    // SafeSky real-time subscription - only active when layer is enabled
    let safeskyChannel: ReturnType<typeof supabase.channel> | null = null;
    let safeskyDebounceTimer: number | null = null;
    let safeskyPollInterval: number | null = null;
    
    // Debounced fetch to prevent excessive re-renders from multiple real-time events
    const debouncedFetchSafeSky = () => {
      if (safeskyDebounceTimer) {
        clearTimeout(safeskyDebounceTimer);
      }
      safeskyDebounceTimer = window.setTimeout(() => {
        fetchSafeSkyBeacons();
      }, 500); // Wait 500ms after last event before fetching
    };
    
    const startSafeSkySubscription = () => {
      if (!safeskyChannel) {
        console.log('Lufttrafikk: Starting real-time subscription');
        // Initial fetch
        fetchSafeSkyBeacons();
        
        // Use polling every 5 seconds instead of individual event triggers
        // This is more efficient when many beacons are updated at once
        safeskyPollInterval = window.setInterval(() => {
          fetchSafeSkyBeacons();
        }, 5000);
        
        // Subscribe to real-time updates with debounce for immediate feedback
        safeskyChannel = supabase
          .channel('safesky-beacons-changes')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'safesky_beacons' },
            () => debouncedFetchSafeSky()
          )
          .subscribe();
      }
    };
    const stopSafeSkySubscription = () => {
      if (safeskyChannel) {
        console.log('Lufttrafikk: Stopping subscription');
        safeskyChannel.unsubscribe();
        safeskyChannel = null;
        safeskyLayer.clearLayers();
        safeskyMarkersCache.clear();
      }
      if (safeskyPollInterval) {
        clearInterval(safeskyPollInterval);
        safeskyPollInterval = null;
      }
      if (safeskyDebounceTimer) {
        clearTimeout(safeskyDebounceTimer);
        safeskyDebounceTimer = null;
      }
    };
    
    // Store subscription controls on the map for access in handleLayerToggle
    (map as any)._safeskyControls = { start: startSafeSkySubscription, stop: stopSafeSkySubscription };
    
    // Start SafeSky subscription immediately since layer is enabled by default
    setTimeout(() => {
      startSafeSkySubscription();
    }, 500);

    const missionsChannel = supabase
      .channel('missions-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'missions' },
        () => fetchAndDisplayMissions()
      )
      .subscribe();

    const telemetryChannel = supabase
      .channel('telemetry-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drone_telemetry' },
        () => fetchDroneTelemetry()
      )
      .subscribe();

    // Real-time subscription for active flights (advisory areas and pilot positions)
    const activeFlightsChannel = supabase
      .channel('active-flights-advisories')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'active_flights' },
        () => {
          fetchActiveAdvisories();
          fetchPilotPositions();
        }
      )
      .subscribe();

    return () => {
      clearInterval(droneInterval);
      clearInterval(heartbeatInterval);
      deleteHeartbeat();
      stopSafeSkySubscription();
      map.off("click");
      missionsChannel.unsubscribe();
      telemetryChannel.unsubscribe();
      activeFlightsChannel.unsubscribe();
      map.remove();
    };
  }, []);

  // Recenter map when initialCenter changes (without re-creating the map instance)
  useEffect(() => {
    if (initialCenter && leafletMapRef.current) {
      leafletMapRef.current.setView(initialCenter, 13);
    }
  }, [initialCenter]);

  // Display existing route when provided (without re-creating the map instance)
  useEffect(() => {
    if (existingRoute && existingRoute.coordinates.length > 0) {
      routePointsRef.current = [...existingRoute.coordinates];
      updateRouteDisplay();
    }
  }, [existingRoute, updateRouteDisplay]);

  // Update pilot position marker and VLOS circle
  useEffect(() => {
    if (!pilotLayerRef.current || !leafletMapRef.current) return;
    
    pilotLayerRef.current.clearLayers();
    pilotMarkerRef.current = null;
    pilotCircleRef.current = null;
    
    if (!pilotPosition) return;
    
    const VLOS_RADIUS = 120; // 120 meters (max altitude VLOS)
    
    // Create pilot marker with controller icon
    const pilotIcon = L.divIcon({
      className: '',
      html: `<div style="
        width: 36px;
        height: 36px;
        background: #8b5cf6;
        border: 3px solid white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="8" r="5"/>
          <path d="M20 21a8 8 0 0 0-16 0"/>
        </svg>
      </div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -18],
    });
    
    const marker = L.marker([pilotPosition.lat, pilotPosition.lng], { 
      icon: pilotIcon, 
      draggable: mode === 'routePlanning',
      pane: 'routePane',
    });
    
    marker.bindPopup(`
      <div>
        <strong>👤 Pilotposisjon</strong><br/>
        <span style="font-size: 11px; color: #666;">Dra for å flytte</span><br/>
        <span style="font-size: 12px;">VLOS-radius: ${VLOS_RADIUS}m</span>
      </div>
    `);
    
    if (mode === 'routePlanning') {
      marker.on('dragend', (e: any) => {
        const { lat, lng } = e.target.getLatLng();
        const cb = onPilotPositionChangeRef.current;
        if (cb) {
          cb({ lat, lng });
        }
      });
    }
    
    marker.addTo(pilotLayerRef.current);
    pilotMarkerRef.current = marker;
    
    // Create VLOS circle
    const circle = L.circle([pilotPosition.lat, pilotPosition.lng], {
      radius: VLOS_RADIUS,
      color: '#8b5cf6',
      weight: 2,
      fillColor: '#8b5cf6',
      fillOpacity: 0.1,
      dashArray: '5, 5',
      pane: 'routePane',
    });
    circle.addTo(pilotLayerRef.current);
    pilotCircleRef.current = circle;
    
  }, [pilotPosition, mode]);

  const handleLayerToggle = (id: string, enabled: boolean) => {
    const map = leafletMapRef.current;
    if (!map) return;
    
    // Handle SafeSky layer specially - start/stop interval
    if (id === 'safesky') {
      const controls = (map as any)._safeskyControls;
      if (controls) {
        if (enabled) {
          controls.start();
        } else {
          controls.stop();
        }
      }
    }
    
    setLayers((prevLayers) =>
      prevLayers.map((layer) => {
        if (layer.id === id) {
          if (enabled) {
            layer.layer.addTo(map);
          } else {
            layer.layer.remove();
          }
          return { ...layer, enabled };
        }
        return layer;
      })
    );
  };

  // Method to clear route (exposed via ref if needed)
  const clearRoute = useCallback(() => {
    routePointsRef.current = [];
    updateRouteDisplay();
    if (onRouteChange) {
      onRouteChange({ coordinates: [], totalDistance: 0 });
    }
  }, [updateRouteDisplay, onRouteChange]);

  // Method to undo last point
  const undoLastPoint = useCallback(() => {
    if (routePointsRef.current.length > 0) {
      routePointsRef.current.pop();
      updateRouteDisplay();
      if (onRouteChange) {
        const coords = [...routePointsRef.current];
        onRouteChange({
          coordinates: coords,
          totalDistance: calculateTotalDistance(coords),
          areaKm2: calculatePolygonAreaKm2(coords)
        });
      }
    }
  }, [updateRouteDisplay, onRouteChange]);

  return (
    <div className="relative w-full h-full overflow-hidden touch-manipulation select-none">
      <div ref={mapRef} className="w-full h-full touch-manipulation" />
      
      {/* Map controls */}
      <div className="absolute top-4 right-4 z-[1050] flex flex-col gap-2">
        {/* Weather toggle button */}
        <Button
          variant={weatherEnabled ? "default" : "secondary"}
          size="icon"
          className={`shadow-lg ${weatherEnabled ? "" : "bg-card hover:bg-accent"}`}
          onClick={() => {
            if (mode !== "view") return;
            setWeatherEnabled(!weatherEnabled);
          }}
          disabled={mode !== "view"}
          title={
            mode !== "view"
              ? "Værvisning er ikke tilgjengelig under ruteplanlegging"
              : weatherEnabled
                ? "Slå av værvisning"
                : "Slå på værvisning (klikk i kartet)"
          }
        >
          <CloudSun className="h-5 w-5" />
        </Button>

        {/* Base layer toggle button */}
        <Button
          variant="secondary"
          size="icon"
          className="shadow-lg bg-card hover:bg-accent"
          onClick={() => {
            const next =
              baseLayerType === "osm"
                ? "satellite"
                : baseLayerType === "satellite"
                  ? "topo"
                  : "osm";
            switchBaseLayer(next);
          }}
          title={
            baseLayerType === "osm"
              ? "Bytt til satellittkart"
              : baseLayerType === "satellite"
                ? "Bytt til topografisk kart"
                : "Bytt til standard kart"
          }
        >
          {baseLayerType === "osm" ? (
            <Satellite className="h-5 w-5" />
          ) : baseLayerType === "satellite" ? (
            <Mountain className="h-5 w-5" />
          ) : (
            <MapIcon className="h-5 w-5" />
          )}
        </Button>

        {/* Layers / filters */}
        <MapLayerControl layers={layers} onLayerToggle={handleLayerToggle} />

        {/* Route planning button */}
        {mode === "view" && onStartRoutePlanning && (
          <Button
            onClick={onStartRoutePlanning}
            variant="default"
            size="icon"
            className="shadow-lg"
            title="Planlegg ny rute"
          >
            <Route className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Weather enabled hint */}
      {mode === "view" && weatherEnabled && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-background/95 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border border-border z-[1000] text-sm">
          <span className="text-muted-foreground">Klikk på kartet for å se værdata</span>
        </div>
      )}

      {/* Route planning instructions */}
      {mode === "routePlanning" && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-background/95 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border border-border z-[1000] text-sm">
          <span className="text-muted-foreground">Klikk på kartet for å legge til punkter</span>
        </div>
      )}
    </div>
  );
}
