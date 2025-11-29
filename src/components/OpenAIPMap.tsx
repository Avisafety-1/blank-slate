import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { openAipConfig } from "@/lib/openaip";
import { airplanesLiveConfig } from "@/lib/airplaneslive";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_POS: [number, number] = [63.7, 9.6];

interface OpenAIPMapProps {
  onMissionClick?: (mission: any) => void;
}

export function OpenAIPMap({ onMissionClick }: OpenAIPMapProps = {}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);
  const missionsLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    // Init Leaflet-kart
    const map = L.map(mapRef.current).setView(DEFAULT_POS, 8);

    // OSM-bakgrunn
    L.tileLayer(openAipConfig.tiles.base, {
      attribution: openAipConfig.attribution,
      subdomains: "abc",
    }).addTo(map);

    // OpenAIP-luftrom (bygger URL med apiKey i stedet for {key}-option)
    if (openAipConfig.apiKey && openAipConfig.tiles.airspace) {
      const airspaceUrl = openAipConfig.tiles.airspace.replace("{key}", openAipConfig.apiKey);

      L.tileLayer(airspaceUrl, {
        opacity: 0.55,
        subdomains: "abc",
      }).addTo(map);
    } else if (!openAipConfig.apiKey) {
      console.warn("OpenAIP API key mangler – viser kun OSM-bakgrunn (ingen luftromslag).");
    }

    // NSM Sensorforbudsområder (WMS-lag)
    L.tileLayer.wms(
      "https://nsm.geodataonline.no/arcgis/services/Restriksjonsomraader/Restriksjonsomraader/MapServer/WMSServer?",
      {
        layers: "0",
        format: "image/png",
        transparent: true,
        opacity: 1.0,
        attribution: 'NSM Sensorforbudsområder',
      }
    ).addTo(map);

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

    // Eget lag for oppdrag/missions
    const missionsLayer = L.layerGroup().addTo(map);
    missionsLayerRef.current = missionsLayer;

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

          // Lite fly-ikon (✈️), rotert etter heading
          const icon = L.divIcon({
            className: "", // vi styler direkte i HTML
            html: `<div style="
              font-size: 26px;
              transform: translate(-50%, -50%) rotate(${track}deg);
              transform-origin: center center;
            ">✈️</div>`,
            iconSize: [18, 18],
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

    // Første kall
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
      missionsChannel.unsubscribe();
      map.remove();
    };
  }, []);

  return <div ref={mapRef} className="w-full h-full" />;
}
