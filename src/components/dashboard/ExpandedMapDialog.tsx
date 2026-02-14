import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FlightAltitudeProfile } from "./FlightAltitudeProfile";
import { fetchTerrainElevations, buildTerrainProfile, type TerrainPoint } from "@/lib/terrainElevation";

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
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const [flightStats, setFlightStats] = useState<{ maxAlt: number; maxSpeed: number } | null>(null);
  const [terrainData, setTerrainData] = useState<TerrainPoint[]>([]);
  const highlightMarkerRef = useRef<L.CircleMarker | null>(null);
  const [terrainLoading, setTerrainLoading] = useState(false);
  const terrainElevationsRef = useRef<globalThis.Map<string, number>>(new globalThis.Map());

  // Fetch terrain elevation data when dialog opens with flight tracks
  useEffect(() => {
    if (!open || !flightTracks || flightTracks.length === 0) return;

    let cancelled = false;
    setTerrainLoading(true);

    async function loadTerrain() {
      // Sort tracks chronologically before combining
      const sortedTracks = [...flightTracks!].sort((a, b) => {
        const dateA = a.flightDate || a.positions?.[0]?.timestamp || '';
        const dateB = b.flightDate || b.positions?.[0]?.timestamp || '';
        return dateA.localeCompare(dateB);
      });
      const allPositions = sortedTracks.flatMap((t) => t.positions || []);
      if (allPositions.length === 0) { setTerrainLoading(false); return; }

      const elevations = await fetchTerrainElevations(allPositions);
      if (cancelled) return;

      // Store in ref for popup access
      const elevMap = new globalThis.Map<string, number>();
      allPositions.forEach((pos, i) => {
        if (elevations[i] != null) {
          elevMap.set(`${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`, elevations[i]!);
        }
      });
      terrainElevationsRef.current = elevMap;

      // Build profile data for the first track (or all combined)
      const profile = buildTerrainProfile(allPositions, elevations);
      setTerrainData(profile);
      setTerrainLoading(false);
    }

    loadTerrain();
    return () => { cancelled = true; };
  }, [open, flightTracks]);

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
    if (!open || !latitude || !longitude) {
      console.log("[ExpandedMap] Skipping init:", { open, latitude, longitude });
      return;
    }

    console.log("[ExpandedMap] Init effect running:", { latitude, longitude, hasRoute: !!route, hasFlightTracks: !!flightTracks, trackCount: flightTracks?.length, mapKey });

    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 10;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    function tryInitMap() {
      if (cancelled) return;

      const container = mapRef.current;
      if (!container) {
        console.log("[ExpandedMap] No container, retry:", retryCount);
        if (retryCount < maxRetries) {
          retryCount++;
          const t = setTimeout(tryInitMap, 100);
          timeouts.push(t);
        }
        return;
      }

      // Ensure container has dimensions - retry if not ready yet
      if (container.offsetWidth === 0 || container.offsetHeight === 0) {
        console.log("[ExpandedMap] Container has no dimensions, retry:", retryCount, container.offsetWidth, container.offsetHeight);
        if (retryCount < maxRetries) {
          retryCount++;
          const t = setTimeout(tryInitMap, 100);
          timeouts.push(t);
        } else {
          console.error("[ExpandedMap] Gave up after max retries - container never got dimensions");
        }
        return;
      }

      console.log("[ExpandedMap] Container ready:", container.offsetWidth, "x", container.offsetHeight, "retry:", retryCount);

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
        console.log("[ExpandedMap] Creating Leaflet map...");
        // Initialize map
        const map = L.map(container, {
          zoomControl: true,
          scrollWheelZoom: true,
        }).setView([latitude, longitude], 13);
        console.log("[ExpandedMap] Map created successfully, zoom:", map.getZoom());

        leafletMapRef.current = map;

        // Add base layer
        const tileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map);
        tileLayerRef.current = tileLayer;

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

        // Display flight tracks with altitude gradient and clickable telemetry popups
        let maxAlt = 0;
        let maxSpeed = 0;
        if (flightTracks && flightTracks.length > 0) {
          // Create a custom pane for flight tracks above all airspace layers
          if (!map.getPane('flightTrackPane')) {
            map.createPane('flightTrackPane');
            map.getPane('flightTrackPane')!.style.zIndex = '700';
            map.getPane('popupPane')!.style.zIndex = '800';
          }
          const tracksLayer = L.layerGroup().addTo(map);

          flightTracks.forEach((track, trackIndex) => {
            if (!track.positions || track.positions.length < 2) return;

            // Calculate altitude range for gradient coloring
            const altitudes = track.positions
              .map(p => p.alt_msl ?? p.alt ?? null)
              .filter((a): a is number => a != null);
            const minTrackAlt = altitudes.length > 0 ? Math.min(...altitudes) : 0;
            const maxTrackAlt = altitudes.length > 0 ? Math.max(...altitudes) : 0;
            const altRange = maxTrackAlt - minTrackAlt || 1;

            if (maxTrackAlt > maxAlt) maxAlt = maxTrackAlt;
            track.positions.forEach(p => {
              if (p.speed != null && p.speed > maxSpeed) maxSpeed = p.speed;
            });

            // Draw segments with altitude-based color gradient (green=low, red=high)
            // Collect segments in a featureGroup for shared click handler
            const segmentGroup = L.featureGroup().addTo(tracksLayer);
            for (let i = 0; i < track.positions.length - 1; i++) {
              const p1 = track.positions[i];
              const p2 = track.positions[i + 1];
              const alt1 = p1.alt_msl ?? p1.alt ?? minTrackAlt;
              const ratio = (alt1 - minTrackAlt) / altRange;
              const hue = Math.round(120 * (1 - ratio));
              const color = `hsl(${hue}, 80%, 45%)`;
              L.polyline([[p1.lat, p1.lng], [p2.lat, p2.lng]], {
                color,
                weight: 6,
                opacity: 0.9,
                pane: 'flightTrackPane',
              }).addTo(segmentGroup);
            }

            // Click handler on the entire track polyline — find nearest point and show telemetry
            segmentGroup.on('click', (e: L.LeafletMouseEvent) => {
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
                <div style="font-size:12px;line-height:1.6">
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
              radius: 10,
              fillColor: "#22c55e",
              color: "#fff",
              weight: 2,
              fillOpacity: 1,
              pane: 'flightTrackPane',
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
              pane: 'flightTrackPane',
            })
              .addTo(tracksLayer)
              .bindPopup(`<strong>Flytur ${trackIndex + 1} - Slutt</strong>`);
          });
          // Update flight stats for footer display
          if (maxAlt > 0 || maxSpeed > 0) {
            setFlightStats({ maxAlt, maxSpeed });
          }
        }

        if (allPoints.length > 1) {
          const bounds = L.latLngBounds(allPoints);
          console.log("[ExpandedMap] Fitting bounds:", bounds.toBBoxString(), "points:", allPoints.length);
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
          console.log("[ExpandedMap] After fitBounds, zoom:", map.getZoom());
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

            // AIP restriction zones from database (including RMZ/TMZ/ATZ)
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
                      style: { color, weight: 2, fillColor: color, fillOpacity: 0.15, dashArray },
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

        // Force map to recalculate size after dialog animation completes
        const invalidateDelays = [300, 500, 800];
        invalidateDelays.forEach((delay) => {
          const t = setTimeout(() => {
            if (!cancelled && leafletMapRef.current) {
              leafletMapRef.current.invalidateSize();
            }
          }, delay);
          timeouts.push(t);
        });
      } catch (err) {
        console.error("Error initializing map:", err);
      }
    }

    // Start first attempt after a short delay for dialog to begin rendering
    const t = setTimeout(tryInitMap, 150);
    timeouts.push(t);

    // Cleanup
    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
    };
  }, [open, latitude, longitude, route, flightTracks, mapKey]);

  // Compute AGL stats from terrain data
  const aglValues = terrainData.filter((d) => d.agl != null).map((d) => d.agl!);
  const maxAgl = aglValues.length > 0 ? Math.max(...aglValues) : null;
  const avgAgl = aglValues.length > 0 ? aglValues.reduce((a, b) => a + b, 0) / aglValues.length : null;

  const hasFlightTracks = flightTracks && flightTracks.length > 0 && flightTracks.some(t => t.positions?.length >= 2);

  // Handle hover on altitude profile — show/remove highlight marker on map
  const handleProfileHover = useCallback((index: number | null) => {
    const map = leafletMapRef.current;
    if (!map) return;

    // Remove existing highlight marker
    if (highlightMarkerRef.current) {
      highlightMarkerRef.current.remove();
      highlightMarkerRef.current = null;
    }

    if (index == null || !terrainData[index]) return;

    const point = terrainData[index];
    highlightMarkerRef.current = L.circleMarker([point.lat, point.lng], {
      radius: 8,
      fillColor: "#ffffff",
      color: "#3b82f6",
      weight: 3,
      fillOpacity: 0.9,
      pane: "flightTrackPane",
    }).addTo(map);
  }, [terrainData]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl w-full sm:w-[95vw] h-[100dvh] sm:h-[90vh] flex flex-col p-0 rounded-none sm:rounded-lg"
        aria-describedby={undefined}
      >
        <DialogHeader className="px-3 py-2">
          <DialogTitle>{missionTitle || "Oppdragskart"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 relative overflow-hidden min-h-0">
          <div key={mapKey} ref={mapRef} className="absolute inset-0" />
          <button
            onClick={() => {
              const map = leafletMapRef.current;
              if (!map || !tileLayerRef.current) return;
              const newType = mapType === 'standard' ? 'satellite' : 'standard';
              setMapType(newType);
              map.removeLayer(tileLayerRef.current);
              const url = newType === 'satellite'
                ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
              const attr = newType === 'satellite'
                ? '&copy; Esri'
                : '&copy; OpenStreetMap contributors';
              tileLayerRef.current = L.tileLayer(url, { attribution: attr }).addTo(map);
            }}
            className="absolute top-2 right-2 z-[1000] bg-background/80 backdrop-blur-sm border border-border rounded-md p-1.5 shadow-md hover:bg-background transition-colors"
            title={mapType === 'standard' ? 'Satellitt' : 'Standard kart'}
          >
            {mapType === 'standard' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>
            )}
          </button>
        </div>

        {hasFlightTracks && (
          <div className="px-2 py-1">
            <FlightAltitudeProfile
              data={terrainData}
              loading={terrainLoading}
              onHoverIndex={handleProfileHover}
            />
          </div>
        )}

        <div className="px-2 py-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div
              className="w-6 h-0.5"
              style={{
                borderStyle: "dashed",
                borderWidth: "1px 0 0",
                borderColor: "#3b82f6",
              }}
            />
            <span>Planlagt rute</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-6 h-0.5" style={{ background: "linear-gradient(90deg, #22c55e, #eab308, #ef4444)" }} />
            <span>Faktisk flytur (farge = høyde)</span>
          </div>
          {flightStats && flightStats.maxAlt > 0 && (
            <>
              <div className="flex items-center gap-1 ml-auto">
                <span>Maks høyde: <strong>{Math.round(flightStats.maxAlt)} m MSL</strong></span>
              </div>
              {flightStats.maxSpeed > 0 && (
                <div className="flex items-center gap-1">
                  <span>Maks hastighet: <strong>{flightStats.maxSpeed.toFixed(1)} m/s</strong></span>
                </div>
              )}
            </>
          )}
          {maxAgl != null && (
            <>
              <div className="flex items-center gap-1">
                <span>Maks AGL: <strong>{Math.round(maxAgl)} m</strong></span>
              </div>
              {avgAgl != null && (
                <div className="flex items-center gap-1">
                  <span>Snitt AGL: <strong>{Math.round(avgAgl)} m</strong></span>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
