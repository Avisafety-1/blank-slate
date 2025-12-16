import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RoutePoint {
  lat: number;
  lng: number;
}

interface RouteData {
  coordinates: RoutePoint[];
  totalDistance: number;
}

interface FlightTrackPosition {
  lat: number;
  lng: number;
  alt?: number;
  timestamp?: string;
}

interface FlightTrack {
  positions: FlightTrackPosition[];
  flightLogId?: string;
  flightDate?: string;
}

interface ExpandedMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  latitude: number;
  longitude: number;
  route?: RouteData | null;
  flightTracks?: FlightTrack[] | null;
  missionTitle?: string;
}

export const ExpandedMapDialog = ({
  open,
  onOpenChange,
  latitude,
  longitude,
  route,
  flightTracks,
  missionTitle,
}: ExpandedMapDialogProps) => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const [mapKey, setMapKey] = useState(0);

  // Reset map key when dialog opens to force fresh initialization
  useEffect(() => {
    if (open) {
      setMapKey((prev) => prev + 1);
    } else {
      // Clean up map when dialog closes
      if (leafletMapRef.current) {
        try {
          leafletMapRef.current.remove();
        } catch (e) {
          // Ignore cleanup errors
        }
        leafletMapRef.current = null;
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open || !latitude || !longitude) return;

    // Wait for DOM to be ready
    const initTimeout = setTimeout(() => {
      const container = mapRef.current;
      if (!container) return;

      // Ensure container has dimensions
      if (container.offsetWidth === 0 || container.offsetHeight === 0) {
        return;
      }

      // Clean up any existing map first
      if (leafletMapRef.current) {
        try {
          leafletMapRef.current.remove();
        } catch (e) {
          // Ignore cleanup errors
        }
        leafletMapRef.current = null;
      }

      try {
        // Initialize map
        const map = L.map(container, {
          zoomControl: true,
          scrollWheelZoom: true,
        }).setView([latitude, longitude], 13);

        leafletMapRef.current = map;

        // Add base layer
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map);

        // Add mission marker
        const icon = L.divIcon({
          className: "",
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

        // Display planned route if provided (blue dashed line)
        if (route && route.coordinates.length > 0) {
          const routeLayer = L.layerGroup().addTo(map);

          // Draw polyline
          if (route.coordinates.length > 1) {
            const latLngs = route.coordinates.map(
              (p) => [p.lat, p.lng] as [number, number]
            );
            L.polyline(latLngs, {
              color: "#3b82f6",
              weight: 4,
              opacity: 0.8,
              dashArray: "10, 5",
            }).addTo(routeLayer);

            latLngs.forEach((ll) => allPoints.push(ll));
          }

          // Add numbered markers for route points
          route.coordinates.forEach((point, index) => {
            const isFirst = index === 0;
            const isLast =
              index === route.coordinates.length - 1 &&
              route.coordinates.length > 1;

            let bgColor = "#3b82f6"; // blue default
            if (isFirst) bgColor = "#22c55e"; // green for start
            else if (isLast) bgColor = "#ef4444"; // red for end

            const marker = L.marker([point.lat, point.lng], {
              icon: L.divIcon({
                className: "",
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
                ">${index + 1}</div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14],
              }),
            });
            marker.addTo(routeLayer);
            marker.bindPopup(`Rutepunkt ${index + 1}`);
          });
        }

        // Display flight tracks if provided (green solid line)
        if (flightTracks && flightTracks.length > 0) {
          const tracksLayer = L.layerGroup().addTo(map);

          flightTracks.forEach((track, trackIndex) => {
            if (!track.positions || track.positions.length < 2) return;

            const latLngs = track.positions.map(
              (p) => [p.lat, p.lng] as [number, number]
            );

            // Draw solid green polyline for actual flight track
            L.polyline(latLngs, {
              color: "#22c55e",
              weight: 4,
              opacity: 0.9,
            }).addTo(tracksLayer);

            latLngs.forEach((ll) => allPoints.push(ll));

            // Add start marker (green circle)
            const startPos = track.positions[0];
            L.circleMarker([startPos.lat, startPos.lng], {
              radius: 10,
              fillColor: "#22c55e",
              color: "#fff",
              weight: 2,
              fillOpacity: 1,
            })
              .addTo(tracksLayer)
              .bindPopup(
                `<strong>Flytur ${trackIndex + 1} - Start</strong>${track.flightDate ? `<br/>${track.flightDate}` : ""}`
              );

            // Add end marker (orange circle)
            const endPos = track.positions[track.positions.length - 1];
            L.circleMarker([endPos.lat, endPos.lng], {
              radius: 10,
              fillColor: "#f97316",
              color: "#fff",
              weight: 2,
              fillOpacity: 1,
            })
              .addTo(tracksLayer)
              .bindPopup(`<strong>Flytur ${trackIndex + 1} - Slutt</strong>`);
          });
        }

        // Fit bounds to show everything
        if (allPoints.length > 1) {
          const bounds = L.latLngBounds(allPoints);
          map.fitBounds(bounds, { padding: [50, 50] });
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
                  color: "#ef4444",
                  weight: 2,
                  fillColor: "#ef4444",
                  fillOpacity: 0.15,
                },
                onEachFeature: (feature, layer) => {
                  const name =
                    feature.properties?.navn ||
                    feature.properties?.name ||
                    "NSM Forbudsområde";
                  layer.bindPopup(`<strong>NSM</strong><br/>${name}`);
                },
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
                  color: "#f97316",
                  weight: 2,
                  fillColor: "#f97316",
                  fillOpacity: 0.15,
                },
                onEachFeature: (feature, layer) => {
                  const name =
                    feature.properties?.navn ||
                    feature.properties?.name ||
                    "RPAS 5km sone";
                  layer.bindPopup(`<strong>RPAS 5km</strong><br/>${name}`);
                },
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
                  color: "#ec4899",
                  weight: 2,
                  fillColor: "#ec4899",
                  fillOpacity: 0.15,
                },
                onEachFeature: (feature, layer) => {
                  const name =
                    feature.properties?.navn ||
                    feature.properties?.name ||
                    "CTR/TIZ";
                  layer.bindPopup(`<strong>RPAS CTR/TIZ</strong><br/>${name}`);
                },
              }).addTo(zonesLayer);
            }
          } catch (err) {
            console.error("Feil ved henting av luftromssoner:", err);
          }
        }

        fetchZones();

        // Force map to recalculate size after dialog animation
        setTimeout(() => {
          if (leafletMapRef.current) {
            leafletMapRef.current.invalidateSize();
          }
        }, 200);
      } catch (err) {
        console.error("Error initializing map:", err);
      }
    }, 200);

    // Cleanup
    return () => {
      clearTimeout(initTimeout);
    };
  }, [open, latitude, longitude, route, flightTracks, mapKey]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl w-[95vw] h-[80vh] flex flex-col p-0"
        aria-describedby={undefined}
      >
        <DialogHeader className="p-4 pb-2">
          <DialogTitle>{missionTitle || "Oppdragskart"}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 relative m-4 mt-0 rounded-lg overflow-hidden border border-border">
          <div key={mapKey} ref={mapRef} className="absolute inset-0" />
        </div>
        <div className="p-4 pt-0 flex gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div
              className="w-6 h-0.5 bg-blue-500"
              style={{
                borderStyle: "dashed",
                borderWidth: "1px 0 0",
                borderColor: "#3b82f6",
              }}
            />
            <span>Planlagt rute</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-6 h-0.5 bg-green-500" />
            <span>Faktisk flytur</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
