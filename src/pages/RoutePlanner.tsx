import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Undo2, Trash2, Save, MapPin, Ruler } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface RouteData {
  coordinates: { lat: number; lng: number }[];
  totalDistance: number;
}

interface LocationState {
  returnTo?: string;
  missionId?: string;
  existingRoute?: RouteData | null;
  formData?: any;
  selectedPersonnel?: string[];
  selectedEquipment?: string[];
  selectedDrones?: string[];
  selectedCustomer?: string;
}

const RoutePlanner = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  
  const state = location.state as LocationState | null;
  
  const [routePoints, setRoutePoints] = useState<{ lat: number; lng: number }[]>(
    state?.existingRoute?.coordinates || []
  );
  const [totalDistance, setTotalDistance] = useState(state?.existingRoute?.totalDistance || 0);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  // Calculate distance between all points
  const calculateTotalDistance = useCallback((points: { lat: number; lng: number }[]) => {
    if (points.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const p1 = L.latLng(points[i - 1].lat, points[i - 1].lng);
      const p2 = L.latLng(points[i].lat, points[i].lng);
      total += p1.distanceTo(p2);
    }
    return total / 1000; // Convert to km
  }, []);

  // Update polyline and markers
  const updateMapElements = useCallback((points: { lat: number; lng: number }[]) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Update or create polyline
    const latLngs = points.map(p => [p.lat, p.lng] as [number, number]);
    
    if (polylineRef.current) {
      polylineRef.current.setLatLngs(latLngs);
    } else if (points.length > 0) {
      polylineRef.current = L.polyline(latLngs, {
        color: '#3b82f6',
        weight: 4,
        opacity: 0.8,
        dashArray: '10, 8'
      }).addTo(map);
    }

    // Add markers for each point
    points.forEach((point, index) => {
      const isFirst = index === 0;
      const isLast = index === points.length - 1;
      
      const markerIcon = L.divIcon({
        className: 'custom-route-marker',
        html: `
          <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-lg border-2 border-white
            ${isFirst ? 'bg-green-500 text-white' : isLast && points.length > 1 ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}">
            ${index + 1}
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([point.lat, point.lng], { 
        icon: markerIcon,
        draggable: true
      }).addTo(map);

      // Handle drag
      marker.on('dragend', (e) => {
        const newLatLng = (e.target as L.Marker).getLatLng();
        setRoutePoints(prev => {
          const updated = [...prev];
          updated[index] = { lat: newLatLng.lat, lng: newLatLng.lng };
          return updated;
        });
      });

      // Handle click to remove
      marker.on('contextmenu', () => {
        setRoutePoints(prev => prev.filter((_, i) => i !== index));
      });

      markersRef.current.push(marker);
    });

    // Update distance
    const dist = calculateTotalDistance(points);
    setTotalDistance(dist);
  }, [calculateTotalDistance]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [63.4305, 10.3951],
      zoom: 10,
      zoomControl: true
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    mapInstanceRef.current = map;

    // Handle map click to add points
    map.on('click', (e) => {
      setRoutePoints(prev => [...prev, { lat: e.latlng.lat, lng: e.latlng.lng }]);
    });

    // Try to center on user location or existing route
    if (state?.existingRoute?.coordinates?.length) {
      const bounds = L.latLngBounds(
        state.existingRoute.coordinates.map(c => [c.lat, c.lng] as [number, number])
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (state?.formData?.latitude && state?.formData?.longitude) {
      map.setView([state.formData.latitude, state.formData.longitude], 14);
    } else {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          map.setView([position.coords.latitude, position.coords.longitude], 12);
        },
        () => {
          // Default to Norway if geolocation fails
          map.setView([63.4305, 10.3951], 10);
        }
      );
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [state]);

  // Update map elements when route points change
  useEffect(() => {
    updateMapElements(routePoints);
  }, [routePoints, updateMapElements]);

  const handleUndo = () => {
    setRoutePoints(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setRoutePoints([]);
    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }
  };

  const handleSave = () => {
    const routeData: RouteData | null = routePoints.length > 0 
      ? { coordinates: routePoints, totalDistance } 
      : null;

    navigate(state?.returnTo || '/oppdrag', {
      state: {
        routeData,
        formData: state?.formData,
        missionId: state?.missionId,
        selectedPersonnel: state?.selectedPersonnel,
        selectedEquipment: state?.selectedEquipment,
        selectedDrones: state?.selectedDrones,
        selectedCustomer: state?.selectedCustomer,
        openDialog: true
      }
    });
  };

  const handleCancel = () => {
    navigate(state?.returnTo || '/oppdrag', {
      state: {
        formData: state?.formData,
        missionId: state?.missionId,
        selectedPersonnel: state?.selectedPersonnel,
        selectedEquipment: state?.selectedEquipment,
        selectedDrones: state?.selectedDrones,
        selectedCustomer: state?.selectedCustomer,
        existingRoute: state?.existingRoute,
        openDialog: true
      }
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-foreground">Laster...</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col w-full overflow-hidden">
      {/* Header */}
      <div className="bg-background/95 backdrop-blur-sm border-b px-4 py-3 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleCancel}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Planlegg rute</h1>
            <p className="text-xs text-muted-foreground">Klikk på kartet for å legge til punkter</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleUndo} disabled={routePoints.length === 0}>
            <Undo2 className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Angre</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleClear} disabled={routePoints.length === 0}>
            <Trash2 className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Nullstill</span>
          </Button>
          <Button size="sm" onClick={handleSave}>
            <Save className="h-4 w-4 mr-1" />
            Lagre rute
          </Button>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <div ref={mapRef} className="absolute inset-0" />
        
        {/* Info overlay */}
        <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-72 bg-background/95 backdrop-blur-sm rounded-lg border shadow-lg p-3 z-[1000]">
          <div className="flex items-center gap-2 text-sm font-medium mb-2">
            <MapPin className="h-4 w-4 text-primary" />
            <span>Ruteinformasjon</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Punkter:</span>
              <span className="ml-1 font-medium">{routePoints.length}</span>
            </div>
            <div className="flex items-center gap-1">
              <Ruler className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Avstand:</span>
              <span className="ml-1 font-medium">{totalDistance.toFixed(2)} km</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Høyreklikk på punkt for å slette • Dra for å flytte
          </p>
        </div>
      </div>

      <style>{`
        .custom-route-marker {
          background: transparent !important;
          border: none !important;
        }
      `}</style>
    </div>
  );
};

export default RoutePlanner;
