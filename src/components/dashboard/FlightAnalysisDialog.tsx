import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import L from "leaflet";
import { FlightAnalysisTimeline } from "./FlightAnalysisTimeline";
import { BarChart3, AlertTriangle } from "lucide-react";
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
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const droneMarkerRef = useRef<L.Marker | null>(null);
  const trailLineRef = useRef<L.Polyline | null>(null);
  const fullLineRef = useRef<L.Polyline | null>(null);
  const startMarkerRef = useRef<L.CircleMarker | null>(null);
  const endMarkerRef = useRef<L.CircleMarker | null>(null);

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

  // Initialize map
  useEffect(() => {
    if (!open || !mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: mapCenter,
      zoom: 15,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

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

    return () => {
      map.remove();
      mapRef.current = null;
      droneMarkerRef.current = null;
      trailLineRef.current = null;
      fullLineRef.current = null;
      startMarkerRef.current = null;
      endMarkerRef.current = null;
    };
  }, [open, mapCenter, polylinePositions, positions]);

  // Update drone marker + trail on index change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !positions.length) return;

    const current = positions[currentIndex];
    if (!current) return;
    const pos: [number, number] = [current.lat, current.lng];

    // Drone marker
    if (droneMarkerRef.current) {
      droneMarkerRef.current.setLatLng(pos);
    } else {
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:20px;height:20px;background:hsl(210,80%,50%);border:2px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      droneMarkerRef.current = L.marker(pos, { icon }).addTo(map);
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

    map.panTo(pos, { animate: true, duration: 0.3 });
  }, [currentIndex, positions, polylinePositions]);

  // Cleanup on close
  useEffect(() => {
    if (!open && mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      droneMarkerRef.current = null;
      trailLineRef.current = null;
      fullLineRef.current = null;
      startMarkerRef.current = null;
      endMarkerRef.current = null;
    }
  }, [open]);

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
        <div
          ref={mapContainerRef}
          className="h-[200px] sm:h-[280px] rounded-lg overflow-hidden border border-border relative z-0"
        />

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
