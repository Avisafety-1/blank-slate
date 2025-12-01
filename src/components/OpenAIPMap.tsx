import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { openAipConfig } from "@/lib/openaip";
import { airplanesLiveConfig } from "@/lib/airplaneslive";
import { supabase } from "@/integrations/supabase/client";
import { MapLayerControl, LayerConfig } from "@/components/MapLayerControl";
import airplaneIcon from "@/assets/airplane-icon.png";

const DEFAULT_POS: [number, number] = [63.7, 9.6];

interface OpenAIPMapProps {
  onMissionClick?: (mission: any) => void;
}

export function OpenAIPMap({ onMissionClick }: OpenAIPMapProps = {}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);
  const missionsLayerRef = useRef<L.LayerGroup | null>(null);
  const [layers, setLayers] = useState<LayerConfig[]>([]);

  useEffect(() => {
    if (!mapRef.current) return;

    // Init Leaflet-kart
    const map = L.map(mapRef.current).setView(DEFAULT_POS, 8);
    leafletMapRef.current = map;

    // OSM-bakgrunn
    const osmLayer = L.tileLayer(openAipConfig.tiles.base, {
      attribution: openAipConfig.attribution,
      subdomains: "abc",
    }).addTo(map);

    // Lag for lag-kontroll
    const layerConfigs: LayerConfig[] = [];

    // OpenAIP-luftrom (bygger URL med apiKey i stedet for {key}-option)
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
    } else if (!openAipConfig.apiKey) {
      console.warn("OpenAIP API key mangler – viser kun OSM-bakgrunn (ingen luftromslag).");
    }

    // NSM Forbudsområder (GeoJSON fra FeatureServer)
    const nsmLayer = L.layerGroup().addTo(map);
    layerConfigs.push({
      id: "nsm",
      name: "NSM Forbudsområder",
      layer: nsmLayer,
      enabled: true,
      icon: "ban",
    });

    // NRL - Nasjonalt register over luftfartshindre (Geonorge)
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

    // Naturverns-restriksjonsområder (Miljødirektoratet)
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

    // RPAS 5km Restriksjonssoner (Luftfartstilsynet)
    const rpasLayer = L.layerGroup().addTo(map);
    layerConfigs.push({
      id: "rpas",
      name: "RPAS 5km soner",
      layer: rpasLayer,
      enabled: true,
      icon: "radio",
    });

    // RPAS CTR/TIZ Kontrollsoner (Luftfartstilsynet)
    const rpasCtрLayer = L.layerGroup().addTo(map);
    layerConfigs.push({
      id: "rpas_ctr",
      name: "RPAS CTR/TIZ",
      layer: rpasCtрLayer,
      enabled: true,
      icon: "shield",
    });

    // Flyplasser (Luftfartstilsynet)
    const airportsLayer = L.layerGroup().addTo(map);
    layerConfigs.push({
      id: "airports",
      name: "Flyplasser",
      layer: airportsLayer,
      enabled: true,
      icon: "planeLanding",
    });

    // Geolokasjon med fallback
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          map.setView(coords, 9);
          
          // Legg til brukerens posisjon som blå sirkel
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
        () => {
          console.log("Geolokasjon nektet, bruker default posisjon");
        },
      );
    }

    // Eget lag for flytrafikk (Airplanes.live)
    const aircraftLayer = L.layerGroup().addTo(map);
    layerConfigs.push({
      id: "aircraft",
      name: "Flytrafikk (live)",
      layer: aircraftLayer,
      enabled: true,
      icon: "plane",
    });

    // Eget lag for oppdrag/missions
    const missionsLayer = L.layerGroup().addTo(map);
    missionsLayerRef.current = missionsLayer;
    layerConfigs.push({
      id: "missions",
      name: "Oppdrag",
      layer: missionsLayer,
      enabled: true,
      icon: "mapPin",
    });

    // Sett layer state
    setLayers(layerConfigs);

    // Funksjon for å hente NSM GeoJSON-data
    async function fetchNsmData() {
      try {
        const url = "https://services9.arcgis.com/qCxEdsGu1A7NwfY1/ArcGIS/rest/services/Forbudsomr%c3%a5derNSM_v/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson";
        
        const response = await fetch(url);
        if (!response.ok) {
          console.error("Feil ved henting av NSM-data:", response.status);
          return;
        }
        
        const geojson = await response.json();
        
        // Legg til GeoJSON-lag med røde polygoner
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

    // Funksjon for å hente RPAS 5km GeoJSON-data
    async function fetchRpasData() {
      try {
        const url = "https://services.arcgis.com/a8CwScMFSS2ljjgn/ArcGIS/rest/services/RPAS_AVIGIS1/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson";
        
        const response = await fetch(url);
        if (!response.ok) {
          console.error("Feil ved henting av RPAS-data:", response.status);
          return;
        }
        
        const geojson = await response.json();
        
        // Legg til GeoJSON-lag med oransje polygoner (distinkt fra NSM som er rød)
        const geoJsonLayer = L.geoJSON(geojson, {
          style: {
            color: '#f97316',      // Oransje kant
            weight: 2,
            fillColor: '#f97316',  // Oransje fyll
            fillOpacity: 0.2,
          },
          onEachFeature: (feature, layer) => {
            // Legg til popup med informasjon om sonen
            if (feature.properties) {
              const props = feature.properties;
              const name = props.navn || props.name || props.NAVN || 'Ukjent';
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

    // Funksjon for å hente RPAS CTR/TIZ GeoJSON-data
    async function fetchRpasCtрData() {
      try {
        const url = "https://services.arcgis.com/a8CwScMFSS2ljjgn/ArcGIS/rest/services/RPAS_CTR_TIZ/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson";
        
        const response = await fetch(url);
        if (!response.ok) {
          console.error("Feil ved henting av RPAS CTR/TIZ-data:", response.status);
          return;
        }
        
        const geojson = await response.json();
        
        // Legg til GeoJSON-lag med rosa/lilla polygoner (distinkt fra andre lag)
        const geoJsonLayer = L.geoJSON(geojson, {
          style: {
            color: '#ec4899',      // Rosa kant
            weight: 2,
            fillColor: '#ec4899',  // Rosa fyll
            fillOpacity: 0.2,
          },
          onEachFeature: (feature, layer) => {
            // Legg til popup med informasjon om sonen
            if (feature.properties) {
              const props = feature.properties;
              const name = props.navn || props.name || props.NAVN || 'Ukjent';
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

    // Funksjon for å hente flyplasser fra Luftfartstilsynet
    async function fetchAirportsData() {
      try {
        const url = "https://services.arcgis.com/a8CwScMFSS2ljjgn/ArcGIS/rest/services/FlyplassInfo_PROD/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson";
        
        const response = await fetch(url);
        if (!response.ok) {
          console.error("Feil ved henting av flyplassdata:", response.status);
          return;
        }
        
        const geojson = await response.json();
        
        // Legg til GeoJSON-lag med markører for flyplasser
        const geoJsonLayer = L.geoJSON(geojson, {
          pointToLayer: (feature, latlng) => {
            // Bruk et distinkt flyplassikon (plane landing SVG)
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
            // Legg til popup med flyplassinformasjon
            if (feature.properties) {
              const props = feature.properties;
              const name = props.NAVN || props.navn || props.name || 'Ukjent flyplass';
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
        const radiusNm = 150; // radius i nautiske mil rundt kartets sentrum

        const url = `${airplanesLiveConfig.baseUrl}/point/` + `${center.lat}/${center.lng}/${radiusNm}`;

        const response = await fetch(url);
        if (!response.ok) {
          console.warn("Airplanes.live error:", response.status, response.statusText);
          return;
        }

        const json = await response.json();

        // Airplanes.live bruker typisk "ac" som liste med fly
        const aircraft = json.ac || json.aircraft || [];

        aircraftLayer.clearLayers();

        for (const ac of aircraft) {
          const lat = ac.lat;
          const lon = ac.lon;
          if (lat == null || lon == null) continue;

          const track = typeof ac.track === "number" ? ac.track : 0;
          const altitude = ac.alt_baro ?? 0;
          
          // Rødt ikon for fly under 1000 fot, ellers standard rødt
          const isLowAltitude = altitude < 1000;
          const filter = isLowAltitude ? 'brightness(0.8) saturate(1.5)' : '';

          // Fly-ikon rotert etter heading
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

          const popup = `
            <div>
              <strong>${ac.call || "Ukjent callsign"}</strong><br/>
              ICAO24: ${ac.hex || "?"}<br/>
              Høyde: ${ac.alt_baro ?? "?"} ft<br/>
              Fart: ${ac.gs ?? "?"} kt<br/>
              Heading: ${ac.track ?? "?"}°<br/>
              Type: ${ac.t || "?"}
            </div>
          `;

          marker.bindPopup(popup);
          marker.addTo(aircraftLayer);
        }
      } catch (err) {
        console.error("Feil ved henting av Airplanes.live:", err);
      }
    }

    // Funksjon for å hente og vise oppdrag
    async function fetchAndDisplayMissions() {
      try {
        const { data: missions, error } = await supabase
          .from("missions")
          .select("*")
          .not("latitude", "is", null)
          .not("longitude", "is", null);

        if (error) {
          console.error("Feil ved henting av oppdrag:", error);
          return;
        }

        if (!missionsLayerRef.current) return;
        
        missionsLayerRef.current.clearLayers();

        missions?.forEach((mission) => {
          if (!mission.latitude || !mission.longitude) return;

          // Velg farge basert på status
          let markerColor = '#3b82f6'; // blå (Planlagt)
          if (mission.status === 'Pågående') markerColor = '#eab308'; // gul
          else if (mission.status === 'Fullført') markerColor = '#6b7280'; // grå
          
          // Opprett en pin med divIcon (SVG MapPin)
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

          // Klikk-handler for å åpne detalj-dialog
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

    // Map click handler for drone weather
    map.on('click', async (e: any) => {
      const { lat, lng } = e.latlng;
      
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
      
      // Fetch weather data
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
    });

    // Første kall
    fetchNsmData();
    fetchRpasData();
    fetchRpasCtрData();
    fetchAirportsData();
    fetchAircraft();
    fetchAndDisplayMissions();

    // Oppdater hvert 10. sekund (API er rate limited til 1 request/sek)
    const interval = setInterval(fetchAircraft, 10000);

    // Lytt til endringer i missions-tabellen (realtime)
    const missionsChannel = supabase
      .channel('missions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'missions'
        },
        () => {
          fetchAndDisplayMissions(); // Oppdater pins ved endringer
        }
      )
      .subscribe();

    // Oppdater etter pan/zoom (med enkel debounce)
    let refreshTimer: number | undefined;
    map.on("moveend", () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      refreshTimer = window.setTimeout(fetchAircraft, 800);
    });

    // Rydd opp ved unmount
    return () => {
      clearInterval(interval);
      map.off("moveend");
      map.off("click");
      missionsChannel.unsubscribe();
      map.remove();
    };
  }, [onMissionClick]);

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

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />
      <MapLayerControl layers={layers} onLayerToggle={handleLayerToggle} />
    </div>
  );
}
