import { OpenAIPMap, RouteData, RoutePoint, SoraSettings } from "@/components/OpenAIPMap";
import { MissionDetailDialog } from "@/components/dashboard/MissionDetailDialog";
import { SoraSettingsPanel } from "@/components/SoraSettingsPanel";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { X, Save, Undo, Trash2, Route, CheckCircle2, AlertTriangle, XCircle, MapPin, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import safeskyLogo from "@/assets/safesky-logo.png";

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
  const [focusFlightId, setFocusFlightId] = useState<string | null>(null);
  
  // Route planning state
  const [isRoutePlanning, setIsRoutePlanning] = useState(false);
  const [routePlanningState, setRoutePlanningState] = useState<RoutePlanningState | null>(null);
  const [currentRoute, setCurrentRoute] = useState<RouteData>({ coordinates: [], totalDistance: 0 });
  
  // Pilot position state for VLOS measurement
  const [pilotPosition, setPilotPosition] = useState<RoutePoint | undefined>(undefined);
  const [isPlacingPilot, setIsPlacingPilot] = useState(false);
  
  // Editing existing mission route
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  
  // SORA settings
  const [soraSettings, setSoraSettings] = useState<SoraSettings>({
    enabled: false,
    flightAltitude: 120,
    contingencyDistance: 50,
    contingencyHeight: 30,
    groundRiskDistance: 100,
  });

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  // Check for route planning mode from navigation state
  useEffect(() => {
    const state = location.state as (RoutePlanningState & { focusFlightId?: string }) | null;
    if (state?.mode === "routePlanning") {
      setIsRoutePlanning(true);
      setRoutePlanningState(state);
      if (state.existingRoute) {
        setCurrentRoute(state.existingRoute);
      }
    }
    if (state?.focusFlightId) {
      setFocusFlightId(state.focusFlightId);
    }
    // Clear the navigation state to prevent re-triggering
    if (state) {
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

  const handleSaveRoute = async () => {
    // Attach SORA settings to route data before saving
    const routeToSave: RouteData = {
      ...currentRoute,
      soraSettings: soraSettings.enabled ? soraSettings : undefined,
    };

    if (editingMissionId) {
      // Direct save to existing mission
      const { error } = await supabase
        .from("missions")
        .update({ route: routeToSave as any })
        .eq("id", editingMissionId);
      
      if (error) {
        toast.error("Kunne ikke oppdatere ruten");
        console.error("Route update error:", error);
        return;
      }
      
      toast.success("Rute og SORA-soner oppdatert");
      setIsRoutePlanning(false);
      setEditingMissionId(null);
      setCurrentRoute({ coordinates: [], totalDistance: 0 });
      setPilotPosition(undefined);
setSoraSettings({ enabled: false, flightAltitude: 120, contingencyDistance: 50, contingencyHeight: 30, groundRiskDistance: 100 });
      return;
    }

    if (routePlanningState) {
      // Coming from mission edit - go back there
      navigate(routePlanningState.returnTo, {
        state: {
          routeData: routeToSave,
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
          routeData: routeToSave,
          openDialog: true,
        }
      });
    }
  };

  // Edit route for an existing mission
  const handleEditMissionRoute = useCallback((mission: any) => {
    const route = mission.route as RouteData | null;
    setEditingMissionId(mission.id);
    setIsRoutePlanning(true);
    setRoutePlanningState(null);
    setMissionDialogOpen(false);
    
    if (route?.coordinates?.length) {
      setCurrentRoute(route);
    } else {
      setCurrentRoute({ coordinates: [], totalDistance: 0 });
    }
    
    if (route?.soraSettings) {
      setSoraSettings(route.soraSettings);
    } else {
      setSoraSettings({ enabled: false, flightAltitude: 120, contingencyDistance: 50, contingencyHeight: 30, groundRiskDistance: 100 });
    }
  }, []);

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
    setPilotPosition(undefined);
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

  const handleTogglePilotPlacement = () => {
    if (isPlacingPilot) {
      setIsPlacingPilot(false);
    } else {
      setIsPlacingPilot(true);
      toast.info("Klikk på kartet for å plassere pilotposisjon");
    }
  };

  const handlePilotPositionChange = useCallback((position: RoutePoint | undefined) => {
    setPilotPosition(position);
    setIsPlacingPilot(false);
    if (position) {
      toast.success("Pilotposisjon satt");
    }
  }, []);

  const handleRemovePilot = () => {
    setPilotPosition(undefined);
  };

  const handleOpenNotam = () => {
    window.open('https://www.ippc.no/ippc/index.jsp', '_blank');
  };

  // Calculate VLOS distances
  const vlisInfo = useMemo(() => {
    if (!pilotPosition || currentRoute.coordinates.length === 0) {
      return null;
    }
    
    const VLOS_LIMIT = 0.12; // 120m in km (max altitude VLOS)
    let maxDistance = 0;
    let pointsOutside = 0;
    
    for (const point of currentRoute.coordinates) {
      const R = 6371; // Earth's radius in km
      const dLat = (point.lat - pilotPosition.lat) * Math.PI / 180;
      const dLng = (point.lng - pilotPosition.lng) * Math.PI / 180;
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(pilotPosition.lat * Math.PI / 180) * Math.cos(point.lat * Math.PI / 180) *
        Math.sin(dLng/2) * Math.sin(dLng/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const dist = R * c;
      
      if (dist > maxDistance) maxDistance = dist;
      if (dist > VLOS_LIMIT) pointsOutside++;
    }
    
    return {
      maxDistance,
      maxDistanceMeters: Math.round(maxDistance * 1000),
      pointsOutside,
      isWithinVLOS: pointsOutside === 0,
    };
  }, [pilotPosition, currentRoute.coordinates]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-foreground">Laster...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col w-full">
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
              
              {/* SafeSky advisory area indicator */}
              {currentRoute.coordinates.length >= 3 && currentRoute.areaKm2 !== undefined && (
                <div className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium",
                  currentRoute.areaKm2 <= 50 
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : currentRoute.areaKm2 <= 150
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                )}>
                  {currentRoute.areaKm2 <= 50 ? (
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                  ) : currentRoute.areaKm2 <= 150 ? (
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                  ) : (
                    <XCircle className="h-3 w-3 shrink-0" />
                  )}
                  <span className="leading-tight">
                    {currentRoute.areaKm2.toFixed(2)} km²
                    {currentRoute.areaKm2 > 150 && (
                      <>
                        <br className="sm:hidden" />
                        <span className="hidden sm:inline"> – </span>
                        <span>for stort for SafeSky</span>
                      </>
                    )}
                    {currentRoute.areaKm2 > 50 && currentRoute.areaKm2 <= 150 && " (stort)"}
                  </span>
                </div>
              )}

              {/* VLOS indicator */}
              {vlisInfo && (
                <div className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium",
                  vlisInfo.isWithinVLOS
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                )}>
                  {vlisInfo.isWithinVLOS ? (
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                  )}
                  <span className="leading-tight">
                    {vlisInfo.maxDistanceMeters}m
                    {!vlisInfo.isWithinVLOS && ` (${vlisInfo.pointsOutside} utenfor)`}
                  </span>
                </div>
              )}
            </div>
            
            {/* Actions - responsive grid on mobile */}
            <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2">
              {/* Pilot position button */}
              <div className="flex items-center gap-1.5">
                <Button
                  variant={isPlacingPilot ? "default" : pilotPosition ? "secondary" : "outline"}
                  size="sm"
                  onClick={pilotPosition ? handleRemovePilot : handleTogglePilotPlacement}
                  className={cn(
                    "h-8 px-2 sm:px-3",
                    isPlacingPilot && "animate-pulse"
                  )}
                  title={pilotPosition ? "Fjern pilotposisjon" : isPlacingPilot ? "Klikk på kartet..." : "Plasser pilot"}
                >
                  <MapPin className="h-4 w-4" />
                  <span className="hidden sm:inline ml-1">
                    {pilotPosition ? "Fjern pilot" : isPlacingPilot ? "Klikk..." : "Pilot"}
                  </span>
                </Button>

                {/* NOTAM link */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenNotam}
                  className="h-8 px-2 sm:px-3"
                  title="Sjekk NOTAM (åpner ippc.no)"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span className="hidden sm:inline ml-1">NOTAM</span>
                </Button>
              </div>

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
          
          {/* SORA Settings Panel */}
          <SoraSettingsPanel settings={soraSettings} onChange={setSoraSettings} />
        </div>
      )}

      {/* Map Content */}
      <div className="flex-1 relative overflow-hidden">
        {/* SafeSky Attribution */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-md flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Traffic data provided by</span>
          <a href="https://www.safesky.app" target="_blank" rel="noopener noreferrer">
            <img src={safeskyLogo} alt="SafeSky" className="h-5 dark:invert" />
          </a>
        </div>
        
        <OpenAIPMap 
          onMissionClick={handleMissionClick}
          mode={isRoutePlanning ? "routePlanning" : "view"}
          existingRoute={routePlanningState?.existingRoute}
          onRouteChange={handleRouteChange}
          initialCenter={routePlanningState?.initialCenter}
          controlledRoute={currentRoute}
          onStartRoutePlanning={handleStartRoutePlanning}
          onPilotPositionChange={handlePilotPositionChange}
          pilotPosition={pilotPosition}
          isPlacingPilot={isPlacingPilot}
          focusFlightId={focusFlightId}
          onFocusFlightHandled={() => setFocusFlightId(null)}
          soraSettings={soraSettings}
        />
      </div>

      {/* Mission Detail Dialog */}
      {!isRoutePlanning && (
        <MissionDetailDialog
          open={missionDialogOpen}
          onOpenChange={setMissionDialogOpen}
          mission={selectedMission}
          onEditRoute={handleEditMissionRoute}
        />
      )}
    </div>
  );
}
