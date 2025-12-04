import { OpenAIPMap, RouteData } from "@/components/OpenAIPMap";
import { MissionDetailDialog } from "@/components/dashboard/MissionDetailDialog";
import { Header } from "@/components/Header";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { X, Save, Undo, Trash2, Route, Plus } from "lucide-react";

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
  missionId?: string;
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

  // Start route planning directly from /kart
  const handleStartRoutePlanning = () => {
    setIsRoutePlanning(true);
    setRoutePlanningState(null); // No state means started from /kart
    setCurrentRoute({ coordinates: [], totalDistance: 0 });
  };

  const handleSaveRoute = () => {
    if (routePlanningState) {
      // Coming from mission edit - go back there
      navigate(routePlanningState.returnTo, {
        state: {
          routeData: currentRoute,
          formData: routePlanningState.formData,
          selectedPersonnel: routePlanningState.selectedPersonnel,
          selectedEquipment: routePlanningState.selectedEquipment,
          selectedDrones: routePlanningState.selectedDrones,
          selectedCustomer: routePlanningState.selectedCustomer,
          missionId: routePlanningState.missionId,
        }
      });
    } else {
      // Started from /kart - go to new mission dialog
      navigate('/oppdrag', {
        state: {
          routeData: currentRoute,
          openDialog: true,
        }
      });
    }
  };

  const handleCancelRoute = () => {
    if (routePlanningState) {
      // Coming from mission edit - go back without saving
      navigate(routePlanningState.returnTo, {
        state: {
          formData: routePlanningState.formData,
          selectedPersonnel: routePlanningState.selectedPersonnel,
          selectedEquipment: routePlanningState.selectedEquipment,
          selectedDrones: routePlanningState.selectedDrones,
          selectedCustomer: routePlanningState.selectedCustomer,
        }
      });
    } else {
      // Started from /kart - just exit route planning mode
      setIsRoutePlanning(false);
      setCurrentRoute({ coordinates: [], totalDistance: 0 });
    }
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
    <div className="h-screen flex flex-col w-full">
      {/* Always show Header for navigation access */}
      <Header />
      
      {/* Route Planning Controls - shown below header when active */}
      {isRoutePlanning && (
        <div className="bg-background border-b border-border px-3 py-2 sm:px-4 sm:py-3 flex-shrink-0">
          {/* Mobile: stacked layout, Desktop: side-by-side */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            {/* Info section */}
            <div className="flex items-center gap-2 sm:gap-3">
              <Route className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
              <div className="min-w-0">
                <h1 className="font-semibold text-foreground text-sm sm:text-base truncate">Planlegg flyrute</h1>
                <p className="text-xs text-muted-foreground">
                  {currentRoute.coordinates.length} punkt{currentRoute.coordinates.length !== 1 ? 'er' : ''} 
                  {currentRoute.totalDistance > 0 && ` • ${currentRoute.totalDistance.toFixed(2)} km`}
                </p>
              </div>
            </div>
            
            {/* Actions - responsive grid on mobile */}
            <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2">
              {/* Undo & Clear grouped together */}
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUndoPoint}
                  disabled={currentRoute.coordinates.length === 0}
                  className="h-8 px-2 sm:px-3"
                  title="Angre siste punkt"
                >
                  <Undo className="h-4 w-4" />
                  <span className="hidden sm:inline ml-1">Angre</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearRoute}
                  disabled={currentRoute.coordinates.length === 0}
                  className="h-8 px-2 sm:px-3"
                  title="Nullstill rute"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline ml-1">Nullstill</span>
                </Button>
              </div>
              
              {/* Cancel & Save grouped together */}
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelRoute}
                  className="h-8 px-2 sm:px-3"
                  title="Avbryt"
                >
                  <X className="h-4 w-4" />
                  <span className="hidden sm:inline ml-1">Avbryt</span>
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveRoute}
                  disabled={currentRoute.coordinates.length < 2}
                  className="h-8 px-2 sm:px-3"
                  title="Lagre rute"
                >
                  <Save className="h-4 w-4" />
                  <span className="hidden sm:inline ml-1">Lagre</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Map Content */}
      <div className="flex-1 relative overflow-hidden">
        <OpenAIPMap 
          onMissionClick={handleMissionClick}
          mode={isRoutePlanning ? "routePlanning" : "view"}
          existingRoute={routePlanningState?.existingRoute}
          onRouteChange={handleRouteChange}
          initialCenter={routePlanningState?.initialCenter}
          controlledRoute={currentRoute}
        />
        
        {/* Route Planning Button - visible when not in route planning mode */}
        {!isRoutePlanning && (
          <Button
            onClick={handleStartRoutePlanning}
            className="absolute bottom-24 sm:bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 z-[1000] shadow-lg"
            size="lg"
          >
            <Route className="h-4 w-4 mr-2" />
            Planlegg ny rute
          </Button>
        )}
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
