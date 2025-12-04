import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { openAipConfig } from "@/lib/openaip";
import { airplanesLiveConfig } from "@/lib/airplaneslive";
import { supabase } from "@/integrations/supabase/client";
import { MapLayerControl, LayerConfig } from "@/components/MapLayerControl";
import { Button } from "@/components/ui/button";
import { CloudSun } from "lucide-react";
import airplaneIcon from "@/assets/airplane-icon.png";

const DEFAULT_POS: [number, number] = [63.7, 9.6];

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface RouteData {
  coordinates: RoutePoint[];
  totalDistance: number;
}

interface OpenAIPMapProps {
  onMissionClick?: (mission: any) => void;
  mode?: "view" | "routePlanning";
  existingRoute?: RouteData | null;
  onRouteChange?: (route: RouteData) => void;
  initialCenter?: [number, number];
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

export function OpenAIPMap({ 
  onMissionClick, 
  mode = "view", 
  existingRoute,
  onRouteChange,
  initialCenter 
}: OpenAIPMapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);
  const missionsLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const routePointsRef = useRef<RoutePoint[]>(existingRoute?.coordinates || []);
  const [layers, setLayers] = useState<LayerConfig[]>([]);
  const [weatherEnabled, setWeatherEnabled] = useState(false);
  const weatherEnabledRef = useRef(false);
  
  // Sync ref with state for use in event handlers
  useEffect(() => {
    weatherEnabledRef.current = weatherEnabled;
  }, [weatherEnabled]);

  // Update route display
  const updateRouteDisplay = useCallback(() => {
    if (!routeLayerRef.current || !leafletMapRef.current) return;
    
    routeLayerRef.current.clearLayers();
    const points = routePointsRef.current;
    
    if (points.length === 0) return;

    // Draw polyline
    if (points.length > 1) {
      const latLngs = points.map(p => [p.lat, p.lng] as [number, number]);
      L.polyline(latLngs, {
        color: '#3b82f6',
        weight: 3,
        opacity: 0.8,
        dashArray: '10, 5'
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
            color: white;
            font-weight: bold;
            font-size: 12px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            cursor: ${mode === 'routePlanning' ? 'move' : 'default'};
          ">${index + 1}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        draggable: mode === 'routePlanning'
      });

      if (mode === 'routePlanning') {
        // Drag to move point
        marker.on('dragend', (e: any) => {
          const { lat, lng } = e.target.getLatLng();
          routePointsRef.current[index] = { lat, lng };
          updateRouteDisplay();
          if (onRouteChange) {
            onRouteChange({
              coordinates: [...routePointsRef.current],
              totalDistance: calculateTotalDistance(routePointsRef.current)
            });
          }
        });

        // Right-click to remove point
        marker.on('contextmenu', (e: any) => {
          L.DomEvent.stopPropagation(e);
          routePointsRef.current.splice(index, 1);
          updateRouteDisplay();
          if (onRouteChange) {
            onRouteChange({
              coordinates: [...routePointsRef.current],
              totalDistance: calculateTotalDistance(routePointsRef.current)
            });
          }
        });
      }

      // Show distance in popup
      let popupContent = `<strong>Punkt ${index + 1}</strong>`;
      if (index > 0) {
        const dist = calculateDistance(
          points[index - 1].lat, points[index - 1].lng,
          point.lat, point.lng
        );
        popupContent += `<br/>Avstand fra forrige: ${dist.toFixed(2)} km`;
      }
      if (mode === 'routePlanning') {
        popupContent += '<br/><em style="font-size: 11px; color: #666;">Dra for å flytte, høyreklikk for å slette</em>';
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
          className: '',
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
        interactive: false
      }).addTo(routeLayerRef.current);
    }
  }, [mode, onRouteChange]);

  useEffect(() => {
    if (!mapRef.current) return;

    const startCenter = initialCenter || DEFAULT_POS;
    const map = L.map(mapRef.current).setView(startCenter, initialCenter ? 13 : 8);
    leafletMapRef.current = map;

    // OSM background
    const osmLayer = L.tileLayer(openAipConfig.tiles.base, {
      attribution: openAipConfig.attribution,
      subdomains: "abc",
    }).addTo(map);

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

    // NSM Forbudsområder
    const nsmLayer = L.layerGroup().addTo(map);
    layerConfigs.push({
      id: "nsm",
      name: "NSM Forbudsområder",
      layer: nsmLayer,
      enabled: true,
      icon: "ban",
    });

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

    // Aircraft layer
    const aircraftLayer = L.layerGroup().addTo(map);
    layerConfigs.push({
      id: "aircraft",
      name: "Flytrafikk (live)",
      layer: aircraftLayer,
      enabled: true,
      icon: "plane",
    });

    // Missions layer - only in view mode
    const missionsLayer = L.layerGroup();
    if (mode === "view") {
      missionsLayer.addTo(map);
    }
    missionsLayerRef.current = missionsLayer;
    layerConfigs.push({
      id: "missions",
      name: "Oppdrag",
      layer: missionsLayer,
      enabled: mode === "view",
      icon: "mapPin",
    });

    // Route layer for route planning
    const routeLayer = L.layerGroup().addTo(map);
    routeLayerRef.current = routeLayer;

    setLayers(layerConfigs);

    // Data fetching functions
    async function fetchNsmData() {
      try {
        const url = "https://services9.arcgis.com/qCxEdsGu1A7NwfY1/ArcGIS/rest/services/Forbudsomr%c3%a5derNSM_v/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson";
        const response = await fetch(url);
        if (!response.ok) return;
        
        const geojson = await response.json();
        const geoJsonLayer = L.geoJSON(geojson, {
          style: {
            color: '#ff0000',
            weight: 2,
            fillColor: '#ff0000',
            fillOpacity: 0.25,
          }
        });
        
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
          style: {
            color: '#f97316',
            weight: 2,
            fillColor: '#f97316',
            fillOpacity: 0.2,
          },
          onEachFeature: (feature, layer) => {
            if (feature.properties) {
              const name = feature.properties.navn || feature.properties.name || 'Ukjent';
              layer.bindPopup(`<strong>RPAS 5km sone</strong><br/>${name}`);
            }
          }
        });
        
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
          style: {
            color: '#ec4899',
            weight: 2,
            fillColor: '#ec4899',
            fillOpacity: 0.2,
          },
          onEachFeature: (feature, layer) => {
            if (feature.properties) {
              const name = feature.properties.navn || feature.properties.name || 'Ukjent';
              layer.bindPopup(`<strong>RPAS CTR/TIZ</strong><br/>${name}`);
            }
          }
        });
        
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
            const icon = L.divIcon({
              className: '',
              html: `<div style="
                width: 28px;
                height: 28px;
                display: flex;
                align-items: center;
                justify-content: center;
                background-color: #6366f1;
                border-radius: 6px;
                border: 2px solid #ffffff;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
              ">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 22h20"/>
                  <path d="M6.36 17.4 4 17l-2-4 1.1-.55a2 2 0 0 1 1.8 0l.17.1a2 2 0 0 0 1.8 0L8 12 5 9l.45-1.4L9 6 12 3c.73-.73 1.93-.73 2.66 0s.73 1.93 0 2.66L12 9l-1 4 1.13.7a2 2 0 0 0 1.8 0l.17-.1a2 2 0 0 1 1.8 0L17 14l-2 4-1.9.4-2.5-3.8"/>
                </svg>
              </div>`,
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            });
            return L.marker(latlng, { icon });
          },
          onEachFeature: (feature, layer) => {
            if (feature.properties) {
              const props = feature.properties;
              const name = props.NAVN || props.navn || 'Ukjent flyplass';
              const icao = props.ICAO || props.icao || '';
              const iata = props.IATA || props.iata || '';
              
              let popupContent = `<strong>✈️ ${name}</strong>`;
              if (icao) popupContent += `<br/>ICAO: ${icao}`;
              if (iata) popupContent += `<br/>IATA: ${iata}`;
              
              layer.bindPopup(popupContent);
            }
          }
        });
        
        airportsLayer.clearLayers();
        airportsLayer.addLayer(geoJsonLayer);
      } catch (err) {
        console.error("Kunne ikke hente flyplasser:", err);
      }
    }

    async function fetchAircraft() {
      try {
        const center = map.getCenter();
        const radiusNm = 150;
        const url = `${airplanesLiveConfig.baseUrl}/point/${center.lat}/${center.lng}/${radiusNm}`;
        const response = await fetch(url);
        if (!response.ok) return;

        const json = await response.json();
        const aircraft = json.ac || json.aircraft || [];

        aircraftLayer.clearLayers();

        for (const ac of aircraft) {
          const lat = ac.lat;
          const lon = ac.lon;
          if (lat == null || lon == null) continue;

          const track = typeof ac.track === "number" ? ac.track : 0;
          const altitude = ac.alt_baro ?? 0;
          const isLowAltitude = altitude < 3000;
          const filter = isLowAltitude ? '' : 'hue-rotate(200deg) saturate(0.6)';

          const icon = L.divIcon({
            className: "",
            html: `<div style="
              width: 32px;
              height: 32px;
              transform: translate(-50%, -50%) rotate(${track}deg);
              transform-origin: center center;
              filter: ${filter};
            ">
              <img src="${airplaneIcon}" style="width: 100%; height: 100%;" alt="aircraft" />
            </div>`,
            iconSize: [32, 32],
          });

          const marker = L.marker([lat, lon], { icon });
          marker.bindPopup(`
            <div>
              <strong>${ac.call || "Ukjent callsign"}</strong><br/>
              ICAO24: ${ac.hex || "?"}<br/>
              Høyde: ${ac.alt_baro ?? "?"} ft<br/>
              Fart: ${ac.gs ?? "?"} kt<br/>
              Heading: ${ac.track ?? "?"}°<br/>
              Type: ${ac.t || "?"}
            </div>
          `);
          marker.addTo(aircraftLayer);
        }
      } catch (err) {
        console.error("Feil ved henting av Airplanes.live:", err);
      }
    }

    async function fetchAndDisplayMissions() {
      if (mode !== "view") return;
      
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
            if (onMissionClick) {
              onMissionClick(mission);
            }
          });
          marker.addTo(missionsLayerRef.current!);
        });
      } catch (err) {
        console.error("Feil ved henting av oppdrag:", err);
      }
    }

    // Map click handler - different behavior for route planning vs view mode
    const handleMapClick = async (e: any) => {
      const { lat, lng } = e.latlng;
      
      if (mode === "routePlanning") {
        // Add point to route
        routePointsRef.current.push({ lat, lng });
        updateRouteDisplay();
        if (onRouteChange) {
          onRouteChange({
            coordinates: [...routePointsRef.current],
            totalDistance: calculateTotalDistance(routePointsRef.current)
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

    // Initialize data
    fetchNsmData();
    fetchRpasData();
    fetchRpasCtрData();
    fetchAirportsData();
    fetchAircraft();
    fetchAndDisplayMissions();

    // Display existing route if provided
    if (existingRoute && existingRoute.coordinates.length > 0) {
      routePointsRef.current = [...existingRoute.coordinates];
      updateRouteDisplay();
    }

    const interval = setInterval(fetchAircraft, 10000);

    const missionsChannel = supabase
      .channel('missions-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'missions' },
        () => fetchAndDisplayMissions()
      )
      .subscribe();

    let refreshTimer: number | undefined;
    map.on("moveend", () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(fetchAircraft, 800);
    });

    return () => {
      clearInterval(interval);
      map.off("moveend");
      map.off("click");
      missionsChannel.unsubscribe();
      map.remove();
    };
  }, [onMissionClick, mode, existingRoute, initialCenter, updateRouteDisplay, onRouteChange]);

  const handleLayerToggle = (id: string, enabled: boolean) => {
    const map = leafletMapRef.current;
    if (!map) return;
    
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
        onRouteChange({
          coordinates: [...routePointsRef.current],
          totalDistance: calculateTotalDistance(routePointsRef.current)
        });
      }
    }
  }, [updateRouteDisplay, onRouteChange]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />
      
      {/* Map controls */}
      <div className="fixed top-20 right-4 z-[1000] flex flex-col gap-2">
        {/* Weather toggle button */}
        {mode === "view" && (
          <Button
            variant={weatherEnabled ? "default" : "secondary"}
            size="icon"
            className={`shadow-lg ${weatherEnabled ? '' : 'bg-card hover:bg-accent'}`}
            onClick={() => setWeatherEnabled(!weatherEnabled)}
            title={weatherEnabled ? "Slå av værvisning" : "Slå på værvisning (klikk i kartet)"}
          >
            <CloudSun className="h-5 w-5" />
          </Button>
        )}
      </div>
      
      <MapLayerControl layers={layers} onLayerToggle={handleLayerToggle} />
      
      {/* Weather enabled hint */}
      {mode === "view" && weatherEnabled && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-background/95 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border border-border z-[1000] text-sm">
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
