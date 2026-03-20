import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import L from "leaflet";
import { FlightAnalysisTimeline } from "./FlightAnalysisTimeline";
import { DroneAttitudeIndicator } from "./DroneAttitudeIndicator";
import { BarChart3, AlertTriangle } from "lucide-react";
import { droneAnimatedIcon } from "@/lib/mapIcons";
import "leaflet/dist/leaflet.css";

interface FlightAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flightTrack: { positions: any[]; events?: any[] } | null;
  flightDate?: string;
  droneName?: string;
}

export const FlightAnalysisDialog = ({ open, onOpenChange, flightTrack, flightDate, droneName }: FlightAnalysisDialogProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [tileError, setTileError] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const droneMarkerRef = useRef<L.Marker | null>(null);
  const trailLineRef = useRef<L.Polyline | null>(null);
  const fullLineRef = useRef<L.Polyline | null>(null);
  const startMarkerRef = useRef<L.CircleMarker | null>(null);
  const endMarkerRef = useRef<L.CircleMarker | null>(null);
  const initAttemptRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  const positions = useMemo(() => flightTrack?.positions || [], [flightTrack]);
  const events = useMemo(() => flightTrack?.events || [], [flightTrack]);

  useEffect(() => { setCurrentIndex(0); }, [flightTrack]);

  const polylinePositions = useMemo(() =>
    positions.map((p: any) => [p.lat, p.lng] as [number, number]),
    [positions]
  );

  const mapCenter = useMemo(() => {
    if (!positions.length) return [59.9, 10.7] as [number, number];
    return [positions[0].lat, positions[0].lng] as [number, number];
  }, [positions]);

  const hasAdvancedData = useMemo(() =>
    positions.some((p: any) => p.speed !== undefined || p.rcAileron !== undefined || p.gimbalPitch !== undefined),
    [positions]
  );

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(t => clearTimeout(t));
    timersRef.current = [];
  }, []);

  const destroyMap = useCallback(() => {
    clearTimers();
    if (mapRef.current) {
      try { mapRef.current.remove(); } catch (_) {}
      mapRef.current = null;
    }
    droneMarkerRef.current = null;
    trailLineRef.current = null;
    fullLineRef.current = null;
    startMarkerRef.current = null;
    endMarkerRef.current = null;
    setMapReady(false);
    setTileError(false);
  }, [clearTimers]);

  // Initialize map with retry logic
  useEffect(() => {
    if (!open) return;

    initAttemptRef.current = 0;
    const maxAttempts = 15;

    const tryInitMap = () => {
      const container = mapContainerRef.current;
      if (!container || mapRef.current) return;
      if (container.clientWidth === 0 || container.clientHeight === 0) {
        initAttemptRef.current++;
        if (initAttemptRef.current < maxAttempts) {
          const t = window.setTimeout(tryInitMap, 100);
          timersRef.current.push(t);
        }
        return;
      }

      try {
        const map = L.map(container, {
          center: mapCenter,
          zoom: 15,
          zoomControl: false,
          attributionControl: false,
        });

        let tilesLoaded = false;
        const tileLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: '' });

        tileLayer.on("tileload", () => {
          if (!tilesLoaded) {
            tilesLoaded = true;
            setTileError(false);
          }
        });

        tileLayer.on("tileerror", () => {
          // Only show error if no tiles loaded after a delay
          const t = window.setTimeout(() => {
            if (!tilesLoaded) setTileError(true);
          }, 5000);
          timersRef.current.push(t);
        });

        tileLayer.addTo(map);

        // Full track (faded)
        if (polylinePositions.length > 1) {
          fullLineRef.current = L.polyline(polylinePositions, { color: "hsl(210, 80%, 50%)", weight: 2, opacity: 0.3 }).addTo(map);
          map.fitBounds(fullLineRef.current.getBounds(), { padding: [30, 30] });
        }

        // Start marker
        if (positions.length > 0) {
          startMarkerRef.current = L.circleMarker([positions[0].lat, positions[0].lng], {
            radius: 5, color: "hsl(142, 76%, 36%)", fillColor: "hsl(142, 76%, 36%)", fillOpacity: 1,
          }).addTo(map);
        }

        // End marker
        if (positions.length > 1) {
          const last = positions[positions.length - 1];
          endMarkerRef.current = L.circleMarker([last.lat, last.lng], {
            radius: 5, color: "hsl(0, 84%, 60%)", fillColor: "hsl(0, 84%, 60%)", fillOpacity: 1,
          }).addTo(map);
        }

        mapRef.current = map;

        // Staggered invalidateSize for dialog animation
        [100, 300, 500, 800, 1200].forEach(delay => {
          const t = window.setTimeout(() => {
            if (mapRef.current) {
              mapRef.current.invalidateSize();
              if (fullLineRef.current) {
                mapRef.current.fitBounds(fullLineRef.current.getBounds(), { padding: [30, 30] });
              }
            }
          }, delay);
          timersRef.current.push(t);
        });

        // Mark ready after stabilization
        const readyTimer = window.setTimeout(() => setMapReady(true), 400);
        timersRef.current.push(readyTimer);

      } catch (e) {
        console.error("FlightAnalysisDialog: map init failed", e);
        initAttemptRef.current++;
        if (initAttemptRef.current < maxAttempts) {
          const t = window.setTimeout(tryInitMap, 200);
          timersRef.current.push(t);
        }
      }
    };

    // Start first attempt after a short delay to let dialog animation begin
    const t = window.setTimeout(tryInitMap, 150);
    timersRef.current.push(t);

    return () => {
      destroyMap();
    };
  }, [open, mapCenter, polylinePositions, positions, clearTimers, destroyMap]);

  // Update drone marker + trail on index change (only when map is ready)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !positions.length) return;

    const current = positions[currentIndex];
    if (!current) return;
    const pos: [number, number] = [current.lat, current.lng];

    // Drone marker
    if (droneMarkerRef.current) {
      droneMarkerRef.current.setLatLng(pos);
    } else {
      const icon = L.icon({
        iconUrl: droneAnimatedIcon,
        iconSize: [48, 48],
        iconAnchor: [24, 24],
        className: 'drone-analysis-marker',
      });
      droneMarkerRef.current = L.marker(pos, { icon, zIndexOffset: 1000 }).addTo(map);
    }

    // Trail
    const trail = polylinePositions.slice(0, currentIndex + 1);
    if (trail.length > 1) {
      if (trailLineRef.current) {
        trailLineRef.current.setLatLngs(trail);
      } else {
        trailLineRef.current = L.polyline(trail, { color: "hsl(210, 80%, 50%)", weight: 3, opacity: 0.8 }).addTo(map);
      }
    }

    // Offset drone to left 1/3 when gyro overlay is visible
    const hasGyro = current.pitch !== undefined;
    if (hasGyro) {
      const mapSize = map.getSize();
      const targetPoint = map.latLngToContainerPoint(pos);
      const offsetX = mapSize.x / 6; // shift so drone sits at ~1/3 from left
      const offsetPoint = L.point(targetPoint.x + offsetX, targetPoint.y);
      const offsetLatLng = map.containerPointToLatLng(offsetPoint);
      map.panTo(offsetLatLng, { animate: true, duration: 0.3 });
    } else {
      map.panTo(pos, { animate: true, duration: 0.3 });
    }
  }, [currentIndex, positions, polylinePositions, mapReady]);

  if (!flightTrack || !positions.length) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[98vw] max-w-5xl max-h-[95vh] flex flex-col p-3 sm:p-4 gap-3">
        <DialogHeader className="pb-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <BarChart3 className="w-5 h-5 text-primary" />
            Flyanalyse
            {droneName && <span className="text-muted-foreground font-normal">— {droneName}</span>}
          </DialogTitle>
          <DialogDescription className="sr-only">Detaljert flyanalyse med kart og telemetri</DialogDescription>
          <div className="flex items-center gap-2 flex-wrap">
            {flightDate && (
              <Badge variant="outline" className="text-xs">
                {new Date(flightDate).toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', year: 'numeric' })}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">{positions.length} datapunkter</Badge>
            {!hasAdvancedData && (
              <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Begrenset telemetri (importert før utvidet analyse)
              </Badge>
            )}
            {events.length > 0 && (
              <Badge variant="outline" className="text-xs border-destructive/50 text-destructive">
                {events.length} hendelser
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* Map */}
        <div className="relative">
          <div
            ref={mapContainerRef}
            className="h-[200px] sm:h-[280px] rounded-lg overflow-hidden border border-border relative z-0"
          />
          {/* Tile error fallback */}
          {tileError && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/80 rounded-lg z-[5]">
              <p className="text-sm text-muted-foreground">Kartet kunne ikke lastes – prøv å åpne analysen på nytt</p>
            </div>
          )}
          {/* Attitude indicator overlay */}
          {mapReady && positions[currentIndex]?.pitch !== undefined && (
            <div className="absolute top-2 right-2 z-10">
              <DroneAttitudeIndicator
                pitch={positions[currentIndex]?.pitch ?? 0}
                roll={positions[currentIndex]?.roll ?? 0}
                yaw={positions[currentIndex]?.yaw}
              />
            </div>
          )}
        </div>

        {/* Timeline + Charts */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <FlightAnalysisTimeline
            positions={positions}
            currentIndex={currentIndex}
            onIndexChange={setCurrentIndex}
            events={events}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
