import { OpenAIPMap, RouteData, RoutePoint, SoraSettings } from "@/components/OpenAIPMap";
import { MissionDetailDialog } from "@/components/dashboard/MissionDetailDialog";
import { SoraSettingsPanel } from "@/components/SoraSettingsPanel";
import { AdjacentAreaPanel } from "@/components/AdjacentAreaPanel";
import { calculateAdjacentRadius, computeSoraVolumePopulationDensity, type AdjacentAreaResult, type SoraPopulationDensityResult } from "@/lib/adjacentAreaCalculator";
import { calculateAlos } from "@/lib/alosCalculator";
import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { Box } from "lucide-react";

// Lazy-load 3D map — MapLibre er ~800 KB. Lastes kun når brukeren aktiverer 3D.
const Map3D = lazy(() => import("@/components/Map3D"));
// soraGeometry imports removed — buffer computation moved to FlightHub2SendDialog
import { useAppHeartbeat } from "@/hooks/useAppHeartbeat";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { X, Save, Undo, Trash2, Route, CheckCircle2, AlertTriangle, XCircle, MapPin, ExternalLink, Upload, Send, ChevronDown, Users, ArrowLeft, MousePointer2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import safeskyLogo from "@/assets/safesky-logo.png";
import { parseKmlOrKmz } from "@/lib/kmlImport";
import { FlightHub2SendDialog } from "@/components/FlightHub2SendDialog";
import { pickBestDroneCatalogMatch } from "@/lib/droneCatalog";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading, companyId } = useAuth();
  useAppHeartbeat();
  const [selectedMission, setSelectedMission] = useState<any>(null);
  const [missionDialogOpen, setMissionDialogOpen] = useState(false);
  const [focusFlightId, setFocusFlightId] = useState<string | null>(null);
  
  
  // Route planning state
  const [isRoutePlanning, setIsRoutePlanning] = useState(false);
  const [routeInspectMode, setRouteInspectMode] = useState(false);

  const [routePlanningState, setRoutePlanningState] = useState<RoutePlanningState | null>(null);
  const [currentRoute, setCurrentRoute] = useState<RouteData>({ coordinates: [], totalDistance: 0 });
  const [routeUndoToken, setRouteUndoToken] = useState(0);

  // 3D-modus (MapLibre). Ruteplanlegging støttes nå også i 3D — ingen
  // automatisk deaktivering.
  const [is3D, setIs3D] = useState(false);

  // Delt viewport mellom 2D og 3D — kun lest ved mount, ikke som live prop
  // (ellers ville moveend → setState → ny initialCenter-prop → setView-loop låse kartet).
  const lastViewRef = useRef<{ center: [number, number]; zoom: number } | null>(null);
  const handleViewChange = useCallback((center: [number, number], zoom: number) => {
    lastViewRef.current = { center, zoom };
  }, []);
  
  // Pilot position state for VLOS measurement
  const [pilotPosition, setPilotPosition] = useState<RoutePoint | undefined>(undefined);
  const [isPlacingPilot, setIsPlacingPilot] = useState(false);
  
  // Editing existing mission route
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [editingMissionStatus, setEditingMissionStatus] = useState<string | null>(null);

  
  // KML import
  const kmlInputRef = useRef<HTMLInputElement>(null);
  const [importingKml, setImportingKml] = useState(false);
  
  // SORA settings - company defaults loaded from company config
  const [companyBufferMode, setCompanyBufferMode] = useState<"corridor" | "convexHull">("corridor");
  const [companyFlightAltitude, setCompanyFlightAltitude] = useState(120);
  const [companyFlightGeography, setCompanyFlightGeography] = useState(0);
  const defaultSoraSettings = useMemo<SoraSettings>(() => ({
    enabled: true,
    flightAltitude: companyFlightAltitude,
    flightGeographyDistance: companyFlightGeography,
    contingencyDistance: 50,
    contingencyHeight: 30,
    groundRiskDistance: 100,
    bufferMode: companyBufferMode,
  }), [companyBufferMode, companyFlightAltitude, companyFlightGeography]);
  const [soraSettings, setSoraSettings] = useState<SoraSettings>(defaultSoraSettings);
  const [soraDroneId, setSoraDroneId] = useState<string | null>(null);
  const [soraDroneModel, setSoraDroneModel] = useState<string | undefined>(undefined);
  const [soraDroneMaxSpeed, setSoraDroneMaxSpeed] = useState<number | undefined>(undefined);
  const [showAdjacentArea, setShowAdjacentArea] = useState(false);
  const [showPopulationDensity, setShowPopulationDensity] = useState(true);
  const [adjacentResult, setAdjacentResult] = useState<AdjacentAreaResult | null>(null);
  const [soraDensityResult, setSoraDensityResult] = useState<SoraPopulationDensityResult | null>(null);
  const [soraDensityLoading, setSoraDensityLoading] = useState(false);
  const soraDensityCacheRef = useRef<Map<string, SoraPopulationDensityResult>>(new Map());
  const [soraOpen, setSoraOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 640 : true);
  const [adjacentOpen, setAdjacentOpen] = useState(false);

  // Fetch drone model name when soraDroneId changes
  useEffect(() => {
    if (!soraDroneId) { setSoraDroneModel(undefined); setSoraDroneMaxSpeed(undefined); return; }
    supabase.from('drones').select('modell').eq('id', soraDroneId).single().then(({ data }) => {
      setSoraDroneModel(data?.modell || undefined);
      // Also fetch max speed from drone_models catalog
      if (data?.modell) {
        (supabase as any).from('drone_models').select('name, max_wind_mps, max_speed_mps, characteristic_dimension_m').or(`name.ilike.%${data.modell}%,name.ilike.%${data.modell.replace(/^DJI\s+/i, "")}%`).limit(20).then(({ data: models }: any) => {
          const model = pickBestDroneCatalogMatch<{
            name: string;
            max_wind_mps: number | null;
            max_speed_mps: number | null;
            characteristic_dimension_m: number | null;
          }>((models ?? []) as any[], data.modell);
          const catalogSpeed = model?.max_speed_mps ?? (model?.max_wind_mps ? model.max_wind_mps * 2 : undefined);
          setSoraDroneMaxSpeed(catalogSpeed);
          setSoraSettings(prev => prev.droneId === soraDroneId ? {
            ...prev,
            droneName: data.modell,
            characteristicDimensionM: model?.characteristic_dimension_m ?? prev.characteristicDimensionM,
            groundSpeedMps: catalogSpeed ?? prev.groundSpeedMps,
          } : prev);
        });
      }
    });
  }, [soraDroneId]);

  useEffect(() => {
    if (soraSettings.droneId && soraSettings.droneId !== soraDroneId) {
      setSoraDroneId(soraSettings.droneId);
    }
  }, [soraSettings.droneId, soraDroneId]);

  // FlightHub 2 state
  const [hasFH2Token, setHasFH2Token] = useState(false);
  const [fh2DialogOpen, setFh2DialogOpen] = useState(false);

  // SORA buffer zones are now computed inside FlightHub2SendDialog

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  // Fetch company default buffer mode + FH2 token status
  useEffect(() => {
    if (!companyId) return;
    (supabase as any)
      .from("company_sora_config")
      .select("default_buffer_mode, default_flight_geography_m, default_flight_altitude_m")
      .eq("company_id", companyId)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data?.default_buffer_mode) {
          const mode = data.default_buffer_mode as "corridor" | "convexHull";
          setCompanyBufferMode(mode);
          setSoraSettings(prev => prev.bufferMode === "corridor" ? { ...prev, bufferMode: mode } : prev);
        }
        if (data?.default_flight_geography_m != null && data.default_flight_geography_m > 0) {
          setCompanyFlightGeography(data.default_flight_geography_m);
          setSoraSettings(prev => prev.flightGeographyDistance === 0 ? { ...prev, flightGeographyDistance: data.default_flight_geography_m } : prev);
        }
        if (data?.default_flight_altitude_m != null && data.default_flight_altitude_m > 0) {
          setCompanyFlightAltitude(data.default_flight_altitude_m);
          setSoraSettings(prev => prev.flightAltitude === 120 ? { ...prev, flightAltitude: data.default_flight_altitude_m } : prev);
        }
      });
    // Check if FlightHub 2 is configured (edge function handles parent fallback)
    (async () => {
      const { data: cred } = await supabase
        .from("company_fh2_credentials")
        .select("company_id")
        .eq("company_id", companyId)
        .maybeSingle();
      if (cred) {
        setHasFH2Token(true);
        return;
      }
      // No own cred — ask edge function (it checks parent automatically)
      try {
        const { data: testData } = await supabase.functions.invoke("flighthub2-proxy", {
          body: { action: "test-connection" },
        });
        setHasFH2Token(!!testData?.token_ok);
      } catch {
        setHasFH2Token(false);
      }
    })();
  }, [companyId]);

  // Check for route planning mode or viewMission from navigation state
  useEffect(() => {
    const state = location.state as (RoutePlanningState & { focusFlightId?: string; viewMission?: any }) | null;
    if (state?.mode === "routePlanning") {
      setIsRoutePlanning(true);
      setRoutePlanningState(state);
      if (state.existingRoute) {
        setCurrentRoute(state.existingRoute);
        if (state.existingRoute.soraSettings) {
          setSoraSettings(state.existingRoute.soraSettings);
        }
          setShowAdjacentArea(!!state.existingRoute.adjacentAreaDocumentation?.enabled);
          setAdjacentResult((state.existingRoute.adjacentAreaDocumentation as any) || null);
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

  const soraDensityCacheKey = useMemo(() => JSON.stringify({
    coordinates: currentRoute.coordinates.map((p) => [Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6))]),
    sora: {
      enabled: soraSettings.enabled,
      flightGeographyDistance: soraSettings.flightGeographyDistance,
      contingencyDistance: soraSettings.contingencyDistance,
      groundRiskDistance: soraSettings.groundRiskDistance,
      bufferMode: soraSettings.bufferMode ?? "corridor",
      groundSpeedMps: soraSettings.groundSpeedMps ?? soraDroneMaxSpeed ?? null,
    },
    adjacentRadiusM: showAdjacentArea ? calculateAdjacentRadius(soraSettings.groundSpeedMps ?? soraDroneMaxSpeed) : 0,
  }), [currentRoute.coordinates, soraSettings, showAdjacentArea, soraDroneMaxSpeed]);

  useEffect(() => {
    if (!soraSettings.enabled || !showPopulationDensity || currentRoute.coordinates.length < 2) {
      setSoraDensityResult(null);
      setSoraDensityLoading(false);
      return;
    }

    const cached = soraDensityCacheRef.current.get(soraDensityCacheKey);
    if (cached) {
      setSoraDensityResult(cached);
      setSoraDensityLoading(false);
      return;
    }

    const ctrl = new AbortController();
    setSoraDensityLoading(true);
    computeSoraVolumePopulationDensity(
      currentRoute.coordinates,
      soraSettings,
      showAdjacentArea ? calculateAdjacentRadius(soraSettings.groundSpeedMps ?? soraDroneMaxSpeed) : undefined,
      ctrl.signal
    )
      .then((result) => {
        if (!ctrl.signal.aborted) {
          soraDensityCacheRef.current.set(soraDensityCacheKey, result);
          setSoraDensityResult(result);
          setSoraDensityLoading(false);
        }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) {
          setSoraDensityResult(null);
          setSoraDensityLoading(false);
        }
      });

    return () => ctrl.abort();
  }, [currentRoute.coordinates, soraSettings, showPopulationDensity, showAdjacentArea, soraDroneMaxSpeed, soraDensityCacheKey]);

  // Slå sammen befolkningsruter fra SORA-volum og Tilstøtende område slik at
  // Eurostat-/SSB-ruter alltid kommer på kartet automatisk — også når det er
  // tilstøtende-beregningen som finner cellene først (typisk utenfor Norge).
  const mergedDensityCells = useMemo(() => {
    if (!soraSettings.enabled || !showPopulationDensity) return undefined;
    const seen = new Map<string, any>();
    const add = (cells?: any[]) => {
      if (!cells) return;
      for (const c of cells) {
        const k = `${c.centroidLat.toFixed(6)}:${c.centroidLng.toFixed(6)}:${c.population}`;
        if (!seen.has(k)) seen.set(k, c);
        else if (c.isDriver && !seen.get(k).isDriver) seen.set(k, c);
      }
    };
    add(soraDensityResult?.cells);
    if (showAdjacentArea) add(adjacentResult?.densityCells);
    return seen.size ? Array.from(seen.values()) : undefined;
  }, [soraSettings.enabled, showPopulationDensity, soraDensityResult, showAdjacentArea, adjacentResult]);

  // KML import handler
  const handleKmlImport = async (file: File) => {
    setImportingKml(true);
    try {
      const parsed = await parseKmlOrKmz(file);
      setCurrentRoute(parsed);
      toast.success(t('pages.map.kmlImported', { count: parsed.coordinates.length, distance: parsed.totalDistance.toFixed(2) }));
    } catch (err: any) {
      toast.error(err?.message || t('pages.map.importFailed'));
    } finally {
      setImportingKml(false);
      if (kmlInputRef.current) kmlInputRef.current.value = '';
    }
  };

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
      adjacentAreaDocumentation: showAdjacentArea && adjacentResult ? {
        enabled: true,
        calculatedAt: new Date().toISOString(),
        adjacentRadiusM: adjacentResult.adjacentRadiusM,
        adjacentAreaKm2: adjacentResult.adjacentAreaKm2,
        totalPopulation: adjacentResult.totalPopulation,
        avgDensity: adjacentResult.avgDensity,
        threshold: adjacentResult.threshold,
        pass: adjacentResult.pass,
        uaSize: adjacentResult.uaSize,
        sail: adjacentResult.sail,
        populationDensityCategory: adjacentResult.populationDensityCategory,
        outdoorAssemblies: adjacentResult.outdoorAssemblies,
        requiredContainment: adjacentResult.requiredContainment,
        containmentLevel: adjacentResult.containmentLevel,
        statusText: adjacentResult.statusText,
        dataSource: adjacentResult.dataSource,
        method: adjacentResult.method,
        calculation: adjacentResult.calculation,
        driver: adjacentResult.driver,
        maxCellPopulation: adjacentResult.maxCellPopulation,
        gridResolutionM: adjacentResult.gridResolutionM,
      } : undefined,
    };

    if (editingMissionId) {
      // Direct save to existing mission
      const { error } = await supabase
        .from("missions")
        .update({ route: routeToSave as any })
        .eq("id", editingMissionId);
      
      if (error) {
        toast.error(t('pages.map.routeUpdateFailed'));
        console.error("Route update error:", error);
        return;
      }
      
      toast.success(t('pages.map.routeSavedWithSora'));
      // Hold brukeren i route-planning-modus så ruten fortsatt er synlig/redigerbar
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
          selectedDrones: soraDroneId
            ? [...new Set([...(routePlanningState.selectedDrones || []), soraDroneId])]
            : routePlanningState.selectedDrones,
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
          selectedDrones: soraDroneId ? [soraDroneId] : [],
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
      setSoraSettings(defaultSoraSettings);
    }
    setShowAdjacentArea(!!route?.adjacentAreaDocumentation?.enabled);
    setAdjacentResult((route?.adjacentAreaDocumentation as any) || null);
  }, [defaultSoraSettings]);

  // Load mission from ?missionId=... URL param (from "Utvid"-knappen i oppdragskort)
  const handledMissionParamRef = useRef<string | null>(null);
  const [pendingInitialCenter, setPendingInitialCenter] = useState<[number, number] | undefined>(undefined);
  const [missionFlightTracks, setMissionFlightTracks] = useState<
    Array<{ flightLogId: string; flightDate?: string; positions: any[] }> | null
  >(null);
  useEffect(() => {
    if (!user || !companyId) return;
    const mid = searchParams.get("missionId");
    if (!mid) return;
    if (handledMissionParamRef.current === mid) return;
    handledMissionParamRef.current = mid;

    (async () => {
      const [{ data, error }, { data: logs }] = await Promise.all([
        supabase
          .from("missions")
          .select("id, route, latitude, longitude, status")
          .eq("id", mid)
          .maybeSingle(),
        supabase
          .from("flight_logs")
          .select("id, flight_date, flight_track")
          .eq("mission_id", mid),
      ]);

      const tracks = (logs ?? [])
        .filter((l: any) => l.flight_track?.positions?.length >= 2)
        .map((l: any) => ({
          flightLogId: l.id,
          flightDate: l.flight_date,
          positions: l.flight_track.positions,
        }));
      setMissionFlightTracks(tracks.length ? tracks : null);

      if (error || !data) {
        toast.error(t('pages.map.missionNotFound'));
      } else {
        setEditingMissionStatus((data as any).status ?? null);
        const route = (data.route as any) as RouteData | null;
        const coords = route?.coordinates ?? [];
        if (!coords.length) {
          if (data.latitude && data.longitude) {
            setPendingInitialCenter([data.latitude, data.longitude]);
          } else if (tracks.length) {
            const first = tracks[0].positions[0];
            if (first) setPendingInitialCenter([first.lat, first.lng]);
          }
          if (!tracks.length) {
            toast.message(t('pages.map.missionHasNoSavedRoute'));
          }
        } else {
          // Centroid of route coordinates
          const lat = coords.reduce((s, p) => s + p.lat, 0) / coords.length;
          const lng = coords.reduce((s, p) => s + p.lng, 0) / coords.length;
          setPendingInitialCenter([lat, lng]);
          handleEditMissionRoute({ id: data.id, route });
        }
      }

      // Clear the URL param so refresh doesn't re-trigger
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("missionId");
        return next;
      }, { replace: true });
    })();
  }, [user, companyId, searchParams, setSearchParams, handleEditMissionRoute]);


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
      // Started from /kart or editing existing mission route - exit route planning mode
      setIsRoutePlanning(false);
      setRouteInspectMode(false);

      setCurrentRoute({ coordinates: [], totalDistance: 0 });
      setPilotPosition(undefined);
      setAdjacentResult(null);
      setSoraDensityResult(null);
      soraDensityCacheRef.current.clear();
      setEditingMissionId(null);
      setEditingMissionStatus(null);
    }

  };

  const handleClearRoute = () => {
    setCurrentRoute({ coordinates: [], totalDistance: 0 });
    setPilotPosition(undefined);
    setAdjacentResult(null);
    setSoraDensityResult(null);
    soraDensityCacheRef.current.clear();
  };

  const handleUndoPoint = () => {
    if (currentRoute.coordinates.length > 0) {
      setRouteUndoToken((value) => value + 1);
    }
  };

  const handleTogglePilotPlacement = () => {
    if (isPlacingPilot) {
      setIsPlacingPilot(false);
    } else {
      setIsPlacingPilot(true);
      toast.info(t('pages.map.clickToPlacePilot'));
    }
  };

  const handlePilotPositionChange = useCallback((position: RoutePoint | undefined) => {
    setPilotPosition(position);
    setIsPlacingPilot(false);
    if (position) {
      toast.success(t('pages.map.pilotPositionSet'));
    }
  }, []);

  const handleRemovePilot = () => {
    setPilotPosition(undefined);
  };

  const handleOpenNotam = () => {
    window.open('https://www.ippc.no/ippc/index.jsp', '_blank');
  };

  // ALOS-based VLOS radius (falls back to 120 m when no drone selected)
  const alosInfo = useMemo(() => {
    if (!soraSettings.enabled) return null;
    return calculateAlos(soraSettings.characteristicDimensionM, soraDroneModel);
  }, [soraSettings.enabled, soraSettings.characteristicDimensionM, soraDroneModel]);

  const vlosRadiusM = alosInfo?.alosMaxM ?? 120;

  // Calculate VLOS distances
  const vlisInfo = useMemo(() => {
    if (!pilotPosition || currentRoute.coordinates.length === 0) {
      return null;
    }
    
    const VLOS_LIMIT = vlosRadiusM / 1000; // km
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
      vlosLimitMeters: vlosRadiusM,
    };
  }, [pilotPosition, currentRoute.coordinates, vlosRadiusM]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-foreground">{t('pages.map.loading')}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col w-full">
      {/* Route Planning Controls - shown below header when active */}
      {isRoutePlanning && (
        <div className="bg-background border-b border-border px-3 pt-2 pb-1 sm:px-4 sm:pt-3 sm:pb-4 flex-shrink-0 max-h-[50vh] overflow-y-auto">
          <div className="flex flex-col gap-2">
            <input
              ref={kmlInputRef}
              type="file"
              accept=".kml,.kmz"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleKmlImport(file);
              }}
            />

            <div className="sm:hidden">
              <div className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 items-start gap-1.5">
                  <Route className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <h1 className="truncate text-sm font-semibold text-foreground">{t('pages.map.planRoute')}</h1>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('pages.map.points', { count: currentRoute.coordinates.length })}
                      {currentRoute.totalDistance > 0 && ` • ${currentRoute.totalDistance.toFixed(2)} km`}
                    </p>
                  </div>
                </div>

                <div className="ml-auto flex shrink-0 items-center gap-1 self-start">
                  <Button
                    data-tour="map-route-kml"
                    variant="outline"
                    size="sm"
                    onClick={() => kmlInputRef.current?.click()}
                    disabled={importingKml}
                    className="h-8 px-2"
                    title={t('pages.map.importKmlTitle')}
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                  <Button
                    data-tour="map-route-ippc"
                    variant="outline"
                    size="sm"
                    onClick={handleOpenNotam}
                    className="h-8 px-1.5 text-[10px]"
                    title={t('pages.map.checkNotamTitle')}
                  >
                    IPPC
                  </Button>
                  <Button
                    data-tour="map-route-sensor"
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('https://registrering.sensor.nsm.cloudgis.no/', '_blank')}
                    className="h-8 px-1.5 text-[10px]"
                    title={t('pages.map.sensorPermitTitle')}
                  >
                    Sensor
                  </Button>
                  {hasFH2Token && currentRoute.coordinates.length >= 2 && (
                    <Button
                      data-tour="map-route-fh2"
                      variant="outline"
                      size="sm"
                      onClick={() => setFh2DialogOpen(true)}
                      className="h-8 px-1.5 text-[10px]"
                      title={t('pages.map.fh2Title')}
                    >
                      <Send className="mr-0.5 h-3 w-3" />
                      FH2
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-0.5 flex items-center gap-2">
                <div className="min-w-0 flex flex-1 flex-wrap items-center gap-1.5">
                  {currentRoute.coordinates.length >= 3 && currentRoute.areaKm2 !== undefined && (
                    <div
                      className={cn(
                        "inline-flex max-w-full items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium",
                        currentRoute.areaKm2 <= 50
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : currentRoute.areaKm2 <= 150
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      )}
                    >
                      {currentRoute.areaKm2 <= 50 ? (
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                      ) : currentRoute.areaKm2 <= 150 ? (
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                      ) : (
                        <XCircle className="h-3 w-3 shrink-0" />
                      )}
                      <span className="leading-tight break-words">
                        <span>{currentRoute.areaKm2.toFixed(2)} km²</span>
                        {currentRoute.areaKm2 > 150 && <span> – {t('pages.map.tooLargeForSafeSky')}</span>}
                        {currentRoute.areaKm2 > 50 && currentRoute.areaKm2 <= 150 && ` (${t('pages.map.large')})`}
                      </span>
                    </div>
                  )}
                  {vlisInfo && (
                    <div
                      className={cn(
                        "inline-flex max-w-full items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium shrink-0",
                        vlisInfo.isWithinVLOS
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      )}
                    >
                      {vlisInfo.isWithinVLOS ? (
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                      )}
                      <span className="leading-tight break-words">
                        {vlisInfo.maxDistanceMeters}m
                        {!vlisInfo.isWithinVLOS && ` (${t('pages.map.outsideCount', { count: vlisInfo.pointsOutside })})`}
                      </span>
                    </div>
                  )}
                </div>

                <div className="ml-auto flex shrink-0 items-center gap-1 self-center">
                  <Button
                    data-tour="map-pilot-button"
                    variant={isPlacingPilot ? "default" : pilotPosition ? "secondary" : "outline"}
                    size="sm"
                    onClick={pilotPosition ? handleRemovePilot : handleTogglePilotPlacement}
                    className={cn("h-8 px-2", isPlacingPilot && "animate-pulse")}
                    title={pilotPosition ? t('pages.map.removePilot') : isPlacingPilot ? t('pages.map.clickOnMap') : t('pages.map.placePilot')}
                  >
                    <MapPin className="h-4 w-4" />
                  </Button>
                  <Button
                    data-tour="map-route-undo"
                    variant="outline"
                    size="sm"
                    onClick={handleUndoPoint}
                    disabled={currentRoute.coordinates.length === 0}
                    className="h-8 px-2"
                    title={t('pages.map.undoTitle')}
                  >
                    <Undo className="h-4 w-4" />
                  </Button>

                  <Button
                    data-tour="map-route-clear"
                    variant="outline"
                    size="sm"
                    onClick={handleClearRoute}
                    disabled={currentRoute.coordinates.length === 0}
                    className="h-8 px-2"
                    title={t('pages.map.clearTitle')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button
                    data-tour="map-route-cancel"
                    variant="outline"
                    size="sm"
                    onClick={handleCancelRoute}
                    className="h-8 px-2"
                    title={t('pages.map.cancelTitle')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Button
                    data-tour="map-route-save"
                    size="sm"
                    onClick={handleSaveRoute}
                    disabled={currentRoute.coordinates.length < 2}
                    className="h-8 px-2"
                    title={t('pages.map.saveTitle')}
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-1.5 flex-wrap">
              <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 mr-auto">
                <Route className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
                <div className="min-w-0">
                  <h1 className="font-semibold text-foreground text-sm sm:text-base truncate">{t('pages.map.planRoute')}</h1>
                  <p className="text-xs text-muted-foreground">
                    {t('pages.map.points', { count: currentRoute.coordinates.length })}
                    {currentRoute.totalDistance > 0 && ` • ${currentRoute.totalDistance.toFixed(2)} km`}
                  </p>
                </div>
              </div>

              {currentRoute.coordinates.length >= 3 && currentRoute.areaKm2 !== undefined && (
                <div className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium",
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
                    <span>{currentRoute.areaKm2.toFixed(2)} km²</span>
                    {currentRoute.areaKm2 > 150 && (
                      <>
                        <span className="hidden sm:inline"> – </span>
                        <span>{t('pages.map.tooLargeForSafeSky')}</span>
                      </>
                    )}
                    {currentRoute.areaKm2 > 50 && currentRoute.areaKm2 <= 150 && ` (${t('pages.map.large')})`}
                  </span>
                </div>
              )}
              {vlisInfo && (
                <div className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium shrink-0",
                  vlisInfo.isWithinVLOS
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                )}>
                  {vlisInfo.isWithinVLOS ? (
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                  )}
                  <span className="leading-tight whitespace-nowrap">
                    {vlisInfo.maxDistanceMeters}m
                    {!vlisInfo.isWithinVLOS && ` (${t('pages.map.outsideCount', { count: vlisInfo.pointsOutside })})`}
                  </span>
                </div>
              )}

              <Button
                data-tour="map-route-kml"
                variant="outline"
                size="sm"
                onClick={() => kmlInputRef.current?.click()}
                disabled={importingKml}
                className="h-8 px-2 sm:px-3"
                title={t('pages.map.importKmlTitle')}
              >
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">{importingKml ? t('pages.map.importingKml') : t('pages.map.kmlLabel')}</span>
              </Button>
              <Button
                data-tour="map-route-ippc"
                variant="outline"
                size="sm"
                onClick={handleOpenNotam}
                className="h-8 px-1.5 sm:px-3 text-[10px] sm:text-xs"
                title={t('pages.map.checkNotamTitle')}
              >
                IPPC
              </Button>
              <Button
                data-tour="map-route-sensor"
                variant="outline"
                size="sm"
                onClick={() => window.open('https://registrering.sensor.nsm.cloudgis.no/', '_blank')}
                className="h-8 px-1.5 sm:px-3 text-[10px] sm:text-xs"
                title={t('pages.map.sensorPermitTitle')}
              >
                Sensor
              </Button>
              {hasFH2Token && currentRoute.coordinates.length >= 2 && (
                <Button
                  data-tour="map-route-fh2"
                  variant="outline"
                  size="sm"
                  onClick={() => setFh2DialogOpen(true)}
                  className="h-8 px-1.5 sm:px-3 text-[10px] sm:text-xs"
                  title={t('pages.map.fh2Title')}
                >
                  <Send className="h-3 w-3 mr-0.5 sm:mr-1" />
                  FH2
                </Button>
              )}
              <Button
                data-tour="map-pilot-button"
                variant={isPlacingPilot ? "default" : pilotPosition ? "secondary" : "outline"}
                size="sm"
                onClick={pilotPosition ? handleRemovePilot : handleTogglePilotPlacement}
                className={cn(
                  "h-8 px-2 sm:px-3",
                  isPlacingPilot && "animate-pulse"
                )}
                title={pilotPosition ? t('pages.map.removePilot') : isPlacingPilot ? t('pages.map.clickOnMap') : t('pages.map.placePilot')}
              >
                <MapPin className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">
                  {pilotPosition ? t('pages.map.removePilotShort') : isPlacingPilot ? t('pages.map.clickShort') : t('pages.map.pilot')}
                </span>
              </Button>
              <Button
                data-tour="map-route-undo"
                variant="outline"
                size="sm"
                onClick={handleUndoPoint}
                disabled={currentRoute.coordinates.length === 0}
                className="h-8 px-2 sm:px-3"
                title={t('pages.map.undoTitle')}
              >
                <Undo className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">{t('pages.map.undo')}</span>
              </Button>

              <Button
                data-tour="map-route-clear"
                variant="outline"
                size="sm"
                onClick={handleClearRoute}
                disabled={currentRoute.coordinates.length === 0}
                className="h-8 px-2 sm:px-3"
                title={t('pages.map.clearTitle')}
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">{t('pages.map.reset')}</span>
              </Button>
              <Button
                data-tour="map-route-cancel"
                variant="outline"
                size="sm"
                onClick={handleCancelRoute}
                className="h-8 px-2 sm:px-3"
                title={t('pages.map.cancelTitle')}
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">{t('pages.map.cancel')}</span>
              </Button>
              <Button
                data-tour="map-route-save"
                size="sm"
                onClick={handleSaveRoute}
                disabled={currentRoute.coordinates.length < 2}
                className="h-8 px-2 sm:px-3"
                title={t('pages.map.saveTitle')}
              >
                <Save className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">{t('pages.map.save')}</span>
              </Button>
            </div>
          </div>
          
          {/* SORA shared header row */}
          <div className="border-t border-border">
            <div className="flex items-center justify-end gap-2 sm:gap-4 px-3 py-0.5 sm:py-2 sm:px-4">
              {/* Left: SORA volum trigger */}
              <button
                data-tour="map-sora-toggle"
                onClick={() => setSoraOpen((o) => !o)}
                className="flex items-center gap-1.5 sm:gap-2 hover:opacity-80 transition-opacity"
              >
                <span className="text-sm font-medium text-foreground"><span className="sm:hidden">{t('pages.map.buffer')}</span><span className="hidden sm:inline">{t('pages.map.soraVolume')}</span></span>
                <Switch
                  checked={soraSettings.enabled}
                  onCheckedChange={(checked) => {
                    setSoraSettings((s) => ({ ...s, enabled: checked }));
                    if (checked) setShowPopulationDensity(true);
                    if (!checked) {
                      setShowAdjacentArea(false);
                      setSoraDensityResult(null);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="scale-90"
                />
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", soraOpen && "rotate-180")} />
              </button>

              {/* Right: Adjacent area trigger (visible but greyed out when SORA disabled) */}
              <button
                data-tour="map-adjacent-toggle"
                onClick={() => soraSettings.enabled && setAdjacentOpen((o) => !o)}
                className={cn(
                  "flex items-center gap-1.5 transition-opacity",
                  soraSettings.enabled ? "hover:opacity-80 cursor-pointer" : "opacity-40 cursor-not-allowed"
                )}
                disabled={!soraSettings.enabled}
              >
                <Users className="h-3.5 w-3.5 text-blue-500" />
                <span className={cn(
                  "text-xs font-medium",
                  adjacentResult == null
                    ? "text-foreground"
                    : adjacentResult.requiredContainment === "Low"
                      ? "text-green-600 dark:text-green-400"
                      : adjacentResult.requiredContainment === "Medium"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-red-600 dark:text-red-400"
                )}>{t('pages.map.adjacent')}</span>
                <Switch
                  checked={showAdjacentArea}
                  onCheckedChange={(checked) => {
                    setShowAdjacentArea(checked);
                    if (checked) setAdjacentOpen(true);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="scale-90"
                  disabled={!soraSettings.enabled}
                />
                <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", adjacentOpen && soraSettings.enabled && "rotate-180")} />
              </button>
            </div>

            {/* SORA Settings content (mobile only — desktop renders as overlay over map) */}
            <div className="sm:hidden">
              <SoraSettingsPanel
                settings={soraSettings}
                onChange={setSoraSettings}
                onDroneSelected={setSoraDroneId}
                initialDroneId={soraSettings.droneId}
                open={soraOpen}
                onOpenChange={setSoraOpen}
                showPopulationDensity={showPopulationDensity}
                onShowPopulationDensityChange={setShowPopulationDensity}
                populationDensityResult={soraDensityResult}
                populationDensityLoading={soraDensityLoading}
              />
            </div>

            {/* Adjacent Area content (mobile only — desktop renders as overlay over map) */}
            <div className="sm:hidden">
              {soraSettings.enabled && (
                <AdjacentAreaPanel
                  coordinates={currentRoute.coordinates}
                  soraSettings={soraSettings}
                  maxSpeedMps={soraSettings.groundSpeedMps ?? soraDroneMaxSpeed}
                  active={showAdjacentArea}
                  onShowAdjacentArea={setShowAdjacentArea}
                  onResultChange={setAdjacentResult}
                  open={adjacentOpen}
                  onOpenChange={setAdjacentOpen}
                  missionId={editingMissionId ?? routePlanningState?.missionId ?? null}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Map Content */}
      <div className="flex-1 relative overflow-hidden">
        {/* Desktop/Tablet SORA panel overlay (top-left, ~1/3 width) */}
        {isRoutePlanning && soraOpen && (
          <div className="hidden sm:block absolute top-3 left-3 z-[1000] w-[33vw] min-w-[320px] max-w-[460px] max-h-[calc(100vh-10rem)] bg-card/95 backdrop-blur border border-border rounded-lg shadow-xl">
            <button
              onClick={() => setSoraOpen(false)}
              className="absolute top-2 right-2 z-10 p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t('pages.map.closeSoraVolume')}
            >
              <X className="h-4 w-4" />
            </button>
            <div className="max-h-[calc(100vh-10rem)] overflow-y-auto rounded-lg">
              <SoraSettingsPanel
                settings={soraSettings}
                onChange={setSoraSettings}
                onDroneSelected={setSoraDroneId}
                initialDroneId={soraSettings.droneId}
                open={true}
                onOpenChange={setSoraOpen}
                showPopulationDensity={showPopulationDensity}
                onShowPopulationDensityChange={setShowPopulationDensity}
                populationDensityResult={soraDensityResult}
                populationDensityLoading={soraDensityLoading}
              />
            </div>
          </div>
        )}
        {/* Desktop/Tablet Adjacent area panel overlay */}
        {isRoutePlanning && adjacentOpen && soraSettings.enabled && (
          <div className={cn(
            "hidden sm:block absolute top-3 z-[1000] w-[33vw] min-w-[320px] max-w-[460px] max-h-[calc(100vh-10rem)] bg-card/95 backdrop-blur border border-border rounded-lg shadow-xl",
            soraOpen ? "left-[calc(0.75rem+33vw+0.5rem)]" : "left-3"
          )}>
            <button
              onClick={() => setAdjacentOpen(false)}
              className="absolute top-2 right-2 z-10 p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t('pages.map.closeAdjacent')}
            >
              <X className="h-4 w-4" />
            </button>
            <div className="max-h-[calc(100vh-10rem)] overflow-y-auto rounded-lg">
              <AdjacentAreaPanel
                coordinates={currentRoute.coordinates}
                soraSettings={soraSettings}
                maxSpeedMps={soraSettings.groundSpeedMps ?? soraDroneMaxSpeed}
                active={showAdjacentArea}
                onShowAdjacentArea={setShowAdjacentArea}
                onResultChange={setAdjacentResult}
                open={true}
                onOpenChange={setAdjacentOpen}
                missionId={editingMissionId ?? routePlanningState?.missionId ?? null}
              />
            </div>
          </div>
        )}
        {/* Back to mission button + SafeSky Attribution */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[500] flex flex-col items-center gap-2 pointer-events-none">
          {editingMissionId && (
            <Button
              variant="default"
              size="lg"
              onClick={() => navigate('/oppdrag', { state: { missionId: editingMissionId, scrollToMission: true, missionStatus: editingMissionStatus } })}
              className="pointer-events-auto shadow-lg"
              title={t('pages.map.backToMission')}
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              {t('pages.map.backToMission')}
            </Button>
          )}
          <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-md flex items-center gap-2 pointer-events-auto">
            <span className="text-xs text-muted-foreground">{t('pages.map.trafficDataProvidedBy')}</span>
            <a href="https://www.safesky.app" target="_blank" rel="noopener noreferrer">
              <img src={safeskyLogo} alt="SafeSky" className="h-5 dark:invert" />
            </a>
          </div>
        </div>
        
        {/* 2D / 3D toggle — icon-button, sits directly above the Kartlag button */}
        {(() => {
          const toggle3DBtn = (
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setIs3D((v) => !v)}
              className="shadow-lg bg-card hover:bg-accent"
              aria-label={is3D ? t('pages.map.switchTo2D') : t('pages.map.switchTo3D')}
              title={is3D ? t('pages.map.switchTo2D') : t('pages.map.switchTo3DExperimental')}
            >
              <Box className="h-5 w-5" />
            </Button>
          );

          const inspectModeBtn = isRoutePlanning && !is3D ? (
            <Button
              variant={routeInspectMode ? "default" : "secondary"}
              size="icon"
              onClick={() => setRouteInspectMode((v) => !v)}
              className={cn("shadow-lg", routeInspectMode ? "" : "bg-card hover:bg-accent")}
              title={routeInspectMode ? t('pages.map.inspectModeActive') : t('pages.map.inspectModeTitle')}
            >
              <MousePointer2 className="h-5 w-5" />
            </Button>
          ) : null;

          const routePlannerBtn3D = is3D && !isRoutePlanning ? (
            <Button
              onClick={handleStartRoutePlanning}
              variant="default"
              size="icon"
              className="shadow-lg"
              title="Planlegg ny rute"
            >
              <Route className="h-5 w-5" />
            </Button>
          ) : null;

          if (is3D) {
            return (
              <Suspense fallback={<div className="absolute inset-0 bg-muted animate-pulse" />}>
                <Map3D
                  onMissionClick={handleMissionClick}
                  initialCenter={lastViewRef.current?.center}
                  initialZoom={lastViewRef.current?.zoom}
                  onViewChange={handleViewChange}
                  extraStackSlot={<>{toggle3DBtn}{routePlannerBtn3D}</>}
                  mode={isRoutePlanning ? "routePlanning" : "view"}
                  existingRoute={routePlanningState?.existingRoute}
                  controlledRoute={currentRoute}
                  onRouteChange={handleRouteChange}
                  routeUndoToken={routeUndoToken}
                  soraSettings={soraSettings}
                />
              </Suspense>
            );
          }

          return (
            <OpenAIPMap
              onMissionClick={handleMissionClick}
              mode={isRoutePlanning ? "routePlanning" : "view"}
              existingRoute={routePlanningState?.existingRoute}
              onRouteChange={handleRouteChange}
              initialCenter={pendingInitialCenter ?? routePlanningState?.initialCenter ?? lastViewRef.current?.center}
              suppressGeolocationCenter={searchParams.get("missionId") !== null}
              onViewChange={handleViewChange}
              controlledRoute={currentRoute}
                  routeUndoToken={routeUndoToken}
              routeInspectMode={routeInspectMode}

              onStartRoutePlanning={handleStartRoutePlanning}
              onPilotPositionChange={handlePilotPositionChange}
              pilotPosition={pilotPosition}
              pilotVlosRadiusM={vlosRadiusM}
              pilotAlosCalculation={alosInfo?.alosCalculation}
              isPlacingPilot={isPlacingPilot}
              focusFlightId={focusFlightId}
              onFocusFlightHandled={() => setFocusFlightId(null)}
              historicalFlightTracks={missionFlightTracks}
              soraSettings={soraSettings}
              adjacentAreaRadiusM={showAdjacentArea ? calculateAdjacentRadius(soraSettings.groundSpeedMps ?? soraDroneMaxSpeed) : undefined}
              populationDensityCells={mergedDensityCells}
              populationDensityCoveragePolygons={soraSettings.enabled && showPopulationDensity ? soraDensityResult?.coveragePolygons : undefined}
              stackSlotAboveLayers={<>{toggle3DBtn}{inspectModeBtn}</>}
              routeHintOffsetClass={
                isRoutePlanning && soraOpen && adjacentOpen && soraSettings.enabled
                  ? "left-[calc(1.25rem+min(66vw,920px)+0.5rem)]"
                  : isRoutePlanning && (soraOpen || (adjacentOpen && soraSettings.enabled))
                    ? "left-[calc(0.75rem+min(33vw,460px)+0.5rem)]"
                    : undefined
              }
            />
          );
        })()}
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

      {/* FlightHub 2 Send Dialog */}
      <FlightHub2SendDialog
        open={fh2DialogOpen}
        onOpenChange={setFh2DialogOpen}
        route={currentRoute}
        soraSettings={soraSettings.enabled ? soraSettings : undefined}
        droneModelName={soraDroneModel}
        pilotPosition={pilotPosition}
      />
    </div>
  );
}
