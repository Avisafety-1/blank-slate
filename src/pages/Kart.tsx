import { OpenAIPMap, RouteData } from "@/components/OpenAIPMap";
import { MissionDetailDialog } from "@/components/dashboard/MissionDetailDialog";
import { Header } from "@/components/Header";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { X, Save, Undo, Trash2, Route } from "lucide-react";

interface RoutePlanningState {
  mode: "routePlanning";
  returnTo: string;
  existingRoute?: RouteData;
  formData?: any;
  selectedPersonnel?: string[];
  selectedEquipment?: string[];
  selectedDrones?: string[];
  selectedCustomer?: string | null;
  initialCenter?: [number, number];
}

export default function KartPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const [selectedMission, setSelectedMission] = useState<any>(null);
  const [missionDialogOpen, setMissionDialogOpen] = useState(false);
  
  // Route planning state
  const [isRoutePlanning, setIsRoutePlanning] = useState(false);
  const [routePlanningState, setRoutePlanningState] = useState<RoutePlanningState | null>(null);
  const [currentRoute, setCurrentRoute] = useState<RouteData>({ coordinates: [], totalDistance: 0 });

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  // Check for route planning mode from navigation state
  useEffect(() => {
    const state = location.state as RoutePlanningState | null;
    if (state?.mode === "routePlanning") {
      setIsRoutePlanning(true);
      setRoutePlanningState(state);
      if (state.existingRoute) {
        setCurrentRoute(state.existingRoute);
      }
      // Clear the navigation state to prevent re-triggering
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleMissionClick = useCallback((mission: any) => {
    if (isRoutePlanning) return; // Don't open missions in route planning mode
    setSelectedMission(mission);
    setMissionDialogOpen(true);
  }, [isRoutePlanning]);

  const handleRouteChange = useCallback((route: RouteData) => {
    setCurrentRoute(route);
  }, []);

  const handleSaveRoute = () => {
    if (!routePlanningState) return;
    
    // Navigate back with the route data
    navigate(routePlanningState.returnTo, {
      state: {
        routeData: currentRoute,
        formData: routePlanningState.formData,
        selectedPersonnel: routePlanningState.selectedPersonnel,
        selectedEquipment: routePlanningState.selectedEquipment,
        selectedDrones: routePlanningState.selectedDrones,
        selectedCustomer: routePlanningState.selectedCustomer,
      }
    });
  };

  const handleCancelRoute = () => {
    if (!routePlanningState) return;
    
    // Navigate back without saving
    navigate(routePlanningState.returnTo, {
      state: {
        formData: routePlanningState.formData,
        selectedPersonnel: routePlanningState.selectedPersonnel,
        selectedEquipment: routePlanningState.selectedEquipment,
        selectedDrones: routePlanningState.selectedDrones,
        selectedCustomer: routePlanningState.selectedCustomer,
      }
    });
  };

  const handleClearRoute = () => {
    setCurrentRoute({ coordinates: [], totalDistance: 0 });
  };

  const handleUndoPoint = () => {
    if (currentRoute.coordinates.length > 0) {
      const newCoords = currentRoute.coordinates.slice(0, -1);
      let totalDistance = 0;
      for (let i = 1; i < newCoords.length; i++) {
        const R = 6371;
        const dLat = (newCoords[i].lat - newCoords[i-1].lat) * Math.PI / 180;
        const dLng = (newCoords[i].lng - newCoords[i-1].lng) * Math.PI / 180;
        const a = 
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(newCoords[i-1].lat * Math.PI / 180) * Math.cos(newCoords[i].lat * Math.PI / 180) *
          Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        totalDistance += R * c;
      }
      setCurrentRoute({ coordinates: newCoords, totalDistance });
    }
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
      {!isRoutePlanning && <Header />}
      
      {/* Route Planning Header */}
      {isRoutePlanning && (
        <div className="bg-background border-b border-border px-4 py-3 flex items-center justify-between z-[1001]">
          <div className="flex items-center gap-3">
            <Route className="h-5 w-5 text-primary" />
            <div>
              <h1 className="font-semibold text-foreground">Planlegg flyrute</h1>
              <p className="text-xs text-muted-foreground">
                {currentRoute.coordinates.length} punkt{currentRoute.coordinates.length !== 1 ? 'er' : ''} 
                {currentRoute.totalDistance > 0 && ` • ${currentRoute.totalDistance.toFixed(2)} km`}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleUndoPoint}
              disabled={currentRoute.coordinates.length === 0}
            >
              <Undo className="h-4 w-4 mr-1" />
              Angre
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearRoute}
              disabled={currentRoute.coordinates.length === 0}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Nullstill
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelRoute}
            >
              <X className="h-4 w-4 mr-1" />
              Avbryt
            </Button>
            <Button
              size="sm"
              onClick={handleSaveRoute}
              disabled={currentRoute.coordinates.length < 2}
            >
              <Save className="h-4 w-4 mr-1" />
              Lagre rute
            </Button>
          </div>
        </div>
      )}

      {/* Map Content */}
      <div className="flex-1 relative overflow-hidden z-0">
        <OpenAIPMap 
          onMissionClick={handleMissionClick}
          mode={isRoutePlanning ? "routePlanning" : "view"}
          existingRoute={routePlanningState?.existingRoute}
          onRouteChange={handleRouteChange}
          initialCenter={routePlanningState?.initialCenter}
        />
      </div>

      {/* Mission Detail Dialog */}
      {!isRoutePlanning && (
        <MissionDetailDialog
          open={missionDialogOpen}
          onOpenChange={setMissionDialogOpen}
          mission={selectedMission}
        />
      )}
    </div>
  );
}
