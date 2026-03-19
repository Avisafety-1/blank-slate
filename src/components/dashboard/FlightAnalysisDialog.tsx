import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, useMap } from "react-leaflet";
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

// Component to move map to drone position
const MapUpdater = ({ position }: { position: [number, number] | null }) => {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.panTo(position, { animate: true, duration: 0.3 });
    }
  }, [position, map]);
  return null;
};

const droneIcon = L.divIcon({
  className: '',
  html: `<div style="width:20px;height:20px;background:hsl(210,80%,50%);border:2px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

export const FlightAnalysisDialog = ({ open, onOpenChange, flightTrack, flightDate, droneName }: FlightAnalysisDialogProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const positions = useMemo(() => flightTrack?.positions || [], [flightTrack]);
  const events = useMemo(() => flightTrack?.events || [], [flightTrack]);

  // Reset index when flight changes
  useEffect(() => { setCurrentIndex(0); }, [flightTrack]);

  const current = positions[currentIndex];

  // Build polyline with color segments based on speed
  const polylinePositions = useMemo(() => 
    positions.map((p: any) => [p.lat, p.lng] as [number, number]),
    [positions]
  );

  // Trail up to current position  
  const trailPositions = useMemo(() =>
    polylinePositions.slice(0, currentIndex + 1),
    [polylinePositions, currentIndex]
  );

  const mapCenter = useMemo(() => {
    if (!positions.length) return [59.9, 10.7] as [number, number];
    return [positions[0].lat, positions[0].lng] as [number, number];
  }, [positions]);

  const currentPos = current ? [current.lat, current.lng] as [number, number] : null;

  // Determine if we have advanced telemetry
  const hasAdvancedData = useMemo(() => 
    positions.some((p: any) => p.speed !== undefined || p.rcAileron !== undefined || p.gimbalPitch !== undefined),
    [positions]
  );

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
        <div className="h-[200px] sm:h-[280px] rounded-lg overflow-hidden border border-border relative z-0">
          <MapContainer
            center={mapCenter}
            zoom={15}
            className="h-full w-full"
            zoomControl={false}
            attributionControl={false}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {/* Full track (faded) */}
            <Polyline positions={polylinePositions} color="hsl(210, 80%, 50%)" weight={2} opacity={0.3} />
            {/* Trail up to current */}
            {trailPositions.length > 1 && (
              <Polyline positions={trailPositions} color="hsl(210, 80%, 50%)" weight={3} opacity={0.8} />
            )}
            {/* Start marker */}
            <CircleMarker
              center={[positions[0].lat, positions[0].lng]}
              radius={5}
              pathOptions={{ color: 'hsl(142, 76%, 36%)', fillColor: 'hsl(142, 76%, 36%)', fillOpacity: 1 }}
            />
            {/* End marker */}
            <CircleMarker
              center={[positions[positions.length - 1].lat, positions[positions.length - 1].lng]}
              radius={5}
              pathOptions={{ color: 'hsl(0, 84%, 60%)', fillColor: 'hsl(0, 84%, 60%)', fillOpacity: 1 }}
            />
            {/* Current position drone marker */}
            {currentPos && <Marker position={currentPos} icon={droneIcon} />}
            <MapUpdater position={currentPos} />
          </MapContainer>
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
