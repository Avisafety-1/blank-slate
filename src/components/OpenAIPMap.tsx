import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { openAipConfig } from "@/lib/openaip";
import { resolveRootCompanyName } from "@/lib/companyHierarchy";
import { supabase } from "@/integrations/supabase/client";
import { createUniqueChannel } from "@/lib/realtimeChannel";
import { MapLayerControl, LayerConfig } from "@/components/MapLayerControl";
import { ArealbrukLegend } from "@/components/ArealbrukLegend";
import { BefolkningLegend } from "@/components/BefolkningLegend";
import { TettstederLegend } from "@/components/TettstederLegend";
import { EiendomsgrenserLegend } from "@/components/EiendomsgrenserLegend";
import { Button } from "@/components/ui/button";
import { CloudSun, Route, Satellite, Mountain, Map as MapIcon } from "lucide-react";
import { renderSoraZones, renderAdjacentAreaZone } from "@/lib/soraGeometry";
import { useAuth } from "@/contexts/AuthContext";
import { MAP_LAYER_CATALOG } from "@/config/mapLayers";

// Re-export types for backward compatibility
export type { RoutePoint, RouteData, SoraSettings } from "@/types/map";
import type { RoutePoint, RouteData, SoraSettings } from "@/types/map";

// Extracted modules
import { calculateDistance, calculateTotalDistance, calculatePolygonAreaKm2 } from "@/lib/mapGeometry";
import {
  fetchNsmData,
  fetchRpasData,
  fetchAllAipZones,
  fetchObstacles,
  fetchAirportsData,
  fetchAndDisplayMissions,
  fetchAndDisplayPlannedMissionPublications,
  fetchDroneTelemetry,
  fetchActiveAdvisories,
  fetchPilotPositions,
  fetchNaturvernZones,
  fetchVernRestrictionZones,
  fetchCaaDroneZones,
  fetchDkDroneZones,
  fetchDkNatureAreas,
  fetchKraftledningerInBounds,
  fetchAisVesselsInBounds,
  fetchNotams,
  fetchUnifiedAirspaceZones,
} from "@/lib/mapDataFetchers";
import { isUnifiedAirspaceEnabled } from "@/lib/airspaceUnified";
import { resetCache } from "@/lib/viewportLayerCache";
import { createSafeSkyManager } from "@/lib/mapSafeSky";
import { showWeatherPopup } from "@/lib/mapWeatherPopup";
import type { RouteMultiPolygon, SsbPopulationCell } from "@/lib/adjacentAreaCalculator";
import {
  ensureRouteProximityPane,
  createProximityCache,
  updateRouteProximityLayers,
  computeVesselScale,
} from "@/lib/routeProximityLayers";

const DEFAULT_POS: [number, number] = [63.7, 9.6];
const TENSIO_WMS_URL = "https://tensio-prod-k8s10.cloudgis.no/arcgis/services/luftnett/luftnett/MapServer/WMSServer";

const ROUTE_PLANNING_NON_INTERACTIVE_PANES = [
  'overlayPane',
  'aipPane',
  'rmzPane',
  'rpasPane',
  'atzPane',
  'nsmPane',
  'obstaclePane',
  'airportPane',
  'safeskyPane',
  'missionPane',
  'notamPane',
  'notamPinPane',
  'populationDensityPane',
  'tensioPowerPane',
  'powerPane',
  'naisPane',
  'liveFlightPane',
  'routeProximityPane',
];

const isTensioName = (name?: string | null) => name?.toLowerCase().includes("tensio") ?? false;

const escapePopupHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatFeatureInfoPopup = (title: string, properties: Record<string, unknown>) => {
  const hiddenKeys = new Set(["objectid", "globalid", "shape", "shape_length", "shape__length", "shape_area", "shape__area"]);
  const rows = Object.entries(properties)
    .filter(([key, value]) => value !== null && value !== undefined && String(value).trim() !== "" && !hiddenKeys.has(key.toLowerCase()))
    .slice(0, 10)
    .map(([key, value]) => `<div style="display:grid;grid-template-columns:minmax(78px,0.9fr) minmax(110px,1.2fr);gap:8px;font-size:12px;line-height:1.35;padding:2px 0;"><span style="color:#64748b;overflow-wrap:anywhere;">${escapePopupHtml(key)}</span><strong style="font-weight:600;overflow-wrap:anywhere;">${escapePopupHtml(value)}</strong></div>`)
    .join("");

  return `<div style="min-width:190px;max-width:280px;"><strong>${escapePopupHtml(title)}</strong>${rows ? `<div style="margin-top:6px;">${rows}</div>` : "<br/>Ingen detaljer tilgjengelig"}</div>`;
};

const buildTensioFeatureInfoUrl = (map: L.Map, latlng: L.LatLng, infoFormat = "application/geo+json") => {
  const size = map.getSize();
  const point = map.latLngToContainerPoint(latlng);
  const crs = map.options.crs;
  const sw = crs.project(map.getBounds().getSouthWest());
  const ne = crs.project(map.getBounds().getNorthEast());
  const params = new URLSearchParams({
    service: "WMS",
    request: "GetFeatureInfo",
    version: "1.3.0",
    layers: "0,1,2,3,4,5,6,7,8,9",
    query_layers: "0,1,2,3,4,5,6,7,8,9",
    styles: "",
    crs: "EPSG:3857",
    bbox: `${sw.x},${sw.y},${ne.x},${ne.y}`,
    width: String(size.x),
    height: String(size.y),
    i: String(Math.round(point.x)),
    j: String(Math.round(point.y)),
    feature_count: "5",
    info_format: infoFormat,
    format: "image/png",
    transparent: "true",
  });
  return `${TENSIO_WMS_URL}?${params.toString()}`;
};

const formatPlainFeatureInfoPopup = (title: string, text: string) => {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 12);
  if (!lines.length || lines.every((line) => /no features|empty|none/i.test(line))) return "";
  return `<div style="min-width:190px;max-width:280px;"><strong>${escapePopupHtml(title)}</strong><div style="margin-top:6px;font-size:12px;line-height:1.35;white-space:pre-wrap;overflow-wrap:anywhere;">${escapePopupHtml(lines.join("\n"))}</div></div>`;
};

const getPopulationDensityStyle = (density = 0, isHotspot = false): L.PathOptions => {
  const color = density >= 5000 ? 'hsl(var(--destructive))' : density >= 250 ? 'hsl(var(--warning))' : 'hsl(var(--success))';
  return {
    color,
    fillColor: color,
    weight: isHotspot ? 2.5 : 1,
    opacity: isHotspot ? 1 : 0.75,
    fillOpacity: isHotspot ? 0.58 : 0.34,
    pane: 'populationDensityPane',
  };
};

interface OpenAIPMapProps {
  onMissionClick?: (mission: any) => void;
  mode?: "view" | "routePlanning";
  existingRoute?: RouteData | null;
  onRouteChange?: (route: RouteData) => void;
  initialCenter?: [number, number];
  /** If true, the map will not auto-center on the user's GPS position or company location on load. */
  suppressGeolocationCenter?: boolean;
  controlledRoute?: RouteData | null;
  onStartRoutePlanning?: () => void;
  onPilotPositionChange?: (position: RoutePoint | undefined) => void;
  pilotPosition?: RoutePoint;
  pilotVlosRadiusM?: number;
  pilotAlosCalculation?: string;
  isPlacingPilot?: boolean;
  focusFlightId?: string | null;
  onFocusFlightHandled?: () => void;
  soraSettings?: SoraSettings;
  adjacentAreaRadiusM?: number;
  populationDensityCells?: SsbPopulationCell[];
  populationDensityCoveragePolygons?: RouteMultiPolygon;
  routeHintOffsetClass?: string;
  /** Hours from now to include planned mission publications. Default 24. */
  plannedMissionsWindowHours?: number;
  /** Optional button rendered in the right-side stack, directly above the Kartlag button. */
  stackSlotAboveLayers?: React.ReactNode;
  /** Notifies parent of viewport changes (center + zoom) so 2D/3D can stay in sync. */
  onViewChange?: (center: [number, number], zoom: number) => void;
  /** Incrementing trigger from parent toolbar to undo the latest route mutation. */
  routeUndoToken?: number;
  /** If true while in routePlanning mode, map clicks do NOT add waypoints (lets user click geo-zones for info). */
  routeInspectMode?: boolean;
  /** Historical flight tracks to render as green polylines (e.g. flown routes from mission's flight_logs). */
  historicalFlightTracks?: Array<{
    flightLogId?: string;
    flightDate?: string;
    positions: Array<{ lat: number; lng: number; alt?: number; alt_msl?: number; alt_agl?: number; speed?: number; heading?: number; timestamp?: string }>;
  }> | null;
}


export function OpenAIPMap({ 
  onMissionClick, 
  mode = "view", 
  existingRoute,
  onRouteChange,
  initialCenter,
  suppressGeolocationCenter,
  controlledRoute,
  onStartRoutePlanning,
  onPilotPositionChange,
  pilotPosition,
  pilotVlosRadiusM,
  pilotAlosCalculation,
  isPlacingPilot,
  focusFlightId,
  onFocusFlightHandled,
  soraSettings,
  adjacentAreaRadiusM,
  populationDensityCells,
  populationDensityCoveragePolygons,
  routeHintOffsetClass,
  plannedMissionsWindowHours = 24,
  stackSlotAboveLayers,
  onViewChange,
  routeUndoToken,
  routeInspectMode,
  historicalFlightTracks,
}: OpenAIPMapProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith('en') ? 'en-US' : 'nb-NO';

  const { user, companyId, companyName, parentCompanyName, companyLat, companyLon, profileLoaded } = useAuth();
  // Company-level default map layer toggles (jsonb map of layer_id → boolean).
  // Loaded once when the map mounts; used to override hardcoded per-layer defaults.
  const companyDefaultLayersRef = useRef<Record<string, boolean>>({});
  const [companyDefaultLayersLoaded, setCompanyDefaultLayersLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!companyId) {
      companyDefaultLayersRef.current = {};
      setCompanyDefaultLayersLoaded(true);
      return;
    }
    supabase
      .from("companies")
      .select("default_map_layers")
      .eq("id", companyId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const raw = (data as any)?.default_map_layers;
        companyDefaultLayersRef.current =
          raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, boolean>) : {};
        setCompanyDefaultLayersLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);
  // Tensio-laget skal være tilgjengelig for hele Tensio-hierarkiet, også
  // avdelinger som ikke har "tensio" i sitt eget/direkte forelder-navn.
  // Vi resolver derfor rot-selskapets navn (via get_parent_company_id).
  const [isTensioHierarchy, setIsTensioHierarchy] = useState<boolean>(
    isTensioName(companyName) || isTensioName(parentCompanyName),
  );
  useEffect(() => {
    let cancelled = false;
    if (!companyId) {
      setIsTensioHierarchy(false);
      return;
    }
    resolveRootCompanyName(companyId).then((rootName) => {
      if (cancelled) return;
      setIsTensioHierarchy(isTensioName(rootName));
    });
    return () => {
      cancelled = true;
    };
  }, [companyId, companyName, parentCompanyName]);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);
  // Keep focusFlightId in a ref so async geolocation callbacks see the latest value
  // (otherwise the closure captured at map-init time stays null and GPS overrides the focus).
  const focusFlightIdRef = useRef<string | null>(focusFlightId ?? null);
  useEffect(() => {
    focusFlightIdRef.current = focusFlightId ?? null;
  }, [focusFlightId]);
  // Keep the "entered from mission" flag stable for async geolocation callbacks.
  const suppressGeolocationCenterRef = useRef(suppressGeolocationCenter);
  useEffect(() => {
    suppressGeolocationCenterRef.current = suppressGeolocationCenter;
  }, [suppressGeolocationCenter]);
  const missionsLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const nsmGeoJsonRef = useRef<L.GeoJSON<any> | null>(null);
  const rpasGeoJsonRef = useRef<L.GeoJSON<any> | null>(null);
  const aipGeoJsonLayersRef = useRef<L.GeoJSON[]>([]);
  const routePointsRef = useRef<RoutePoint[]>(existingRoute?.coordinates || []);
  const routeHistoryRef = useRef<RoutePoint[][]>([]);
  const lastRouteUndoTokenRef = useRef(routeUndoToken ?? 0);
  const pushRouteHistory = useCallback(() => {
    const snap = routePointsRef.current.map((p) => ({ ...p }));
    routeHistoryRef.current.push(snap);
    if (routeHistoryRef.current.length > 50) routeHistoryRef.current.shift();
  }, []);
  const [routePointCount, setRoutePointCount] = useState(existingRoute?.coordinates?.length || 0);
  const pilotMarkerRef = useRef<L.Marker | null>(null);
  const pilotCircleRef = useRef<L.Circle | null>(null);
  const pilotLayerRef = useRef<L.LayerGroup | null>(null);
  const flightMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const soraSettingsRef = useRef(soraSettings);
  const soraLayerRef = useRef<L.LayerGroup | null>(null);
  const adjacentAreaLayerRef = useRef<L.LayerGroup | null>(null);
  const populationDensityLayerRef = useRef<L.LayerGroup | null>(null);
  const populationDensityRendererRef = useRef<L.Renderer | null>(null);
  const routeProximityLayerRef = useRef<L.LayerGroup | null>(null);
  const naisLayerRef = useRef<L.LayerGroup | null>(null);
  const obstaclesLayerRef = useRef<L.LayerGroup | null>(null);
  const routePlanningInteractiveLayerRefs = useRef<L.Layer[]>([]);
  const routeProximityCacheRef = useRef(createProximityCache());
  const routeProximityAbortRef = useRef<AbortController | null>(null);
  const routeProximityDebounceRef = useRef<number | null>(null);
  const adjacentAreaRadiusMRef = useRef(adjacentAreaRadiusM);
  const populationDensityCellsRef = useRef<SsbPopulationCell[] | undefined>(populationDensityCells);
  const populationDensityCoverageRef = useRef<RouteMultiPolygon | undefined>(populationDensityCoveragePolygons);
  const [layers, setLayers] = useState<LayerConfig[]>([]);
  const [weatherEnabled, setWeatherEnabled] = useState(false);
  const [baseLayerType, setBaseLayerType] = useState<'osm' | 'satellite' | 'topo'>('osm');
  const [befolkningSource, setBefolkningSource] = useState<'ssb' | 'eurostat'>('ssb');
  const baseLayerRef = useRef<L.Layer | null>(null);
  const isPlacingPilotRef = useRef(isPlacingPilot);
  const routeInspectModeRef = useRef(routeInspectMode);

  const onPilotPositionChangeRef = useRef(onPilotPositionChange);
  const weatherEnabledRef = useRef(false);
  const modeRef = useRef(mode);

  const onMissionClickRef = useRef<typeof onMissionClick>(onMissionClick);
  const plannedWindowHoursRef = useRef<number>(plannedMissionsWindowHours);
  const plannedPublishedLayerRef = useRef<L.LayerGroup | null>(null);
  const onRouteChangeRef = useRef<typeof onRouteChange>(onRouteChange);

  const ensurePopulationDensityPane = useCallback((map: L.Map): HTMLElement | null => {
    if (!map.getPane('populationDensityPane')) {
      map.createPane('populationDensityPane');
    }

    const pane = map.getPane('populationDensityPane');
    if (!pane) return null;
    pane.style.zIndex = '635';
    pane.style.pointerEvents = modeRef.current === 'routePlanning' ? 'none' : 'auto';
    return pane;
  }, []);

  const getPopulationDensityRenderer = useCallback((map: L.Map): L.Renderer | undefined => {
    const pane = ensurePopulationDensityPane(map);
    if (!pane) return undefined;
    if (!populationDensityRendererRef.current || !(populationDensityRendererRef.current as any)._map) {
      populationDensityRendererRef.current = L.svg({ pane: 'populationDensityPane' });
    }
    return populationDensityRendererRef.current ?? undefined;
  }, [ensurePopulationDensityPane]);

  const setGeoJsonInteractivity = useCallback(
    (geoJson: L.GeoJSON<any> | null, enabled: boolean) => {
      if (!geoJson) return;

      (geoJson as any).options = { ...(geoJson as any).options, interactive: enabled };

      geoJson.eachLayer((layer: any) => {
        if (layer?.options) {
          layer.options.interactive = enabled;
          layer.options.bubblingMouseEvents = true;
        }

        const el = typeof layer.getElement === "function" ? layer.getElement() : layer?._path;
        if (el) {
          (el as HTMLElement).style.pointerEvents = enabled ? "auto" : "none";
        }

        if (!enabled && typeof layer.removeInteractiveTarget === "function" && el) {
          if (layer._map) layer.removeInteractiveTarget(el);
        } else if (enabled && typeof layer.addInteractiveTarget === "function" && el) {
          if (layer._map) layer.addInteractiveTarget(el);
        }
      });
    },
    []
  );

  const setLeafletLayerInteractivity = useCallback((layer: L.Layer | null | undefined, enabled: boolean) => {
    const applyToLayer = (target: L.Layer | null | undefined) => {
      if (!target) return;

      const group = target as L.LayerGroup;
      if (typeof group.eachLayer === "function") {
        group.eachLayer((child) => applyToLayer(child));
      }

      const anyLayer = target as any;
      if (anyLayer.options) {
        anyLayer.options.interactive = enabled;
        anyLayer.options.bubblingMouseEvents = true;
      }

      const elements = [
        typeof anyLayer.getElement === "function" ? anyLayer.getElement() : null,
        anyLayer._path,
        anyLayer._icon,
        anyLayer._shadow,
      ].filter(Boolean) as HTMLElement[];

      elements.forEach((el) => {
        el.style.pointerEvents = enabled ? "auto" : "none";
        if (!enabled && typeof anyLayer.removeInteractiveTarget === "function") {
          try { anyLayer.removeInteractiveTarget(el); } catch { /* ignore */ }
        } else if (enabled && typeof anyLayer.addInteractiveTarget === "function" && anyLayer._map) {
          try { anyLayer.addInteractiveTarget(el); } catch { /* ignore */ }
        }
      });
    };

    applyToLayer(layer);
  }, []);

  const syncRoutePlanningInteractivity = useCallback((currentMode = modeRef.current, inspectMode = routeInspectModeRef.current) => {
    const map = leafletMapRef.current;
    if (!map) return;

    const overlaysInteractive = currentMode !== "routePlanning" || !!inspectMode;
    const pointerEvents = overlaysInteractive ? "auto" : "none";
    const container = map.getContainer();
    if (currentMode === "routePlanning" && !inspectMode) {
      container.classList.add("route-planning-active");
    } else {
      container.classList.remove("route-planning-active");
    }

    ROUTE_PLANNING_NON_INTERACTIVE_PANES.forEach((paneName) => {
      const pane = map.getPane(paneName);
      if (pane) pane.style.pointerEvents = pointerEvents;
    });

    setGeoJsonInteractivity(nsmGeoJsonRef.current, overlaysInteractive);
    setGeoJsonInteractivity(rpasGeoJsonRef.current, overlaysInteractive);
    aipGeoJsonLayersRef.current.forEach((layer) => setGeoJsonInteractivity(layer, overlaysInteractive));
    routePlanningInteractiveLayerRefs.current.forEach((layer) => setLeafletLayerInteractivity(layer, overlaysInteractive));
  }, [setGeoJsonInteractivity, setLeafletLayerInteractivity]);

  // Switch between base map layers
  const switchBaseLayer = useCallback((newType: 'osm' | 'satellite' | 'topo') => {
    if (!leafletMapRef.current || !baseLayerRef.current) return;

    const map = leafletMapRef.current;
    map.removeLayer(baseLayerRef.current);

    let url: string;
    let attribution: string;
    let subdomains: string | string[] = 'abc';

    switch (newType) {
      case 'satellite':
        url = openAipConfig.tiles.satellite;
        attribution = openAipConfig.attribution.satellite;
        subdomains = [];
        break;
      case 'topo':
        url = openAipConfig.tiles.topo;
        attribution = openAipConfig.attribution.topo;
        break;
      default:
        url = openAipConfig.tiles.base;
        attribution = openAipConfig.attribution.osm;
    }

    const newLayer = L.tileLayer(url, { attribution, subdomains }).addTo(map);

    if ('bringToBack' in newLayer && typeof (newLayer as any).bringToBack === 'function') {
      (newLayer as any).bringToBack();
    }
    baseLayerRef.current = newLayer;
    setBaseLayerType(newType);
  }, []);

  // Sync refs with state/props
  useEffect(() => {
    weatherEnabledRef.current = weatherEnabled;
    if (leafletMapRef.current) {
      const container = leafletMapRef.current.getContainer();
      if (weatherEnabled) {
        container.classList.add('weather-mode-active');
      } else {
        container.classList.remove('weather-mode-active');
      }
    }
  }, [weatherEnabled]);
  useEffect(() => { onMissionClickRef.current = onMissionClick; }, [onMissionClick]);
  useEffect(() => { onRouteChangeRef.current = onRouteChange; }, [onRouteChange]);
  useEffect(() => { isPlacingPilotRef.current = isPlacingPilot; }, [isPlacingPilot]);
  useEffect(() => {
    routeInspectModeRef.current = routeInspectMode;
    syncRoutePlanningInteractivity(modeRef.current, routeInspectMode);
  }, [routeInspectMode, syncRoutePlanningInteractivity]);

  useEffect(() => { onPilotPositionChangeRef.current = onPilotPositionChange; }, [onPilotPositionChange]);
  useEffect(() => {
    plannedWindowHoursRef.current = plannedMissionsWindowHours;
    if (plannedPublishedLayerRef.current) {
      fetchAndDisplayPlannedMissionPublications({
        layer: plannedPublishedLayerRef.current,
        modeRef,
        windowHours: plannedMissionsWindowHours,
      });
    }
  }, [plannedMissionsWindowHours]);

  // Update route display
  const updateRouteDisplay = useCallback(() => {
    if (!routeLayerRef.current || !leafletMapRef.current) return;

    routeLayerRef.current.clearLayers();
    const points = routePointsRef.current;

    if (points.length === 0) {
      soraLayerRef.current?.clearLayers();
      adjacentAreaLayerRef.current?.clearLayers();
      populationDensityLayerRef.current?.clearLayers();
      return;
    }

    // Draw polyline (per-segment so we can insert points between two markers)
    if (points.length > 1) {
      const isPlanning = modeRef.current === 'routePlanning';
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const seg: [number, number][] = [[a.lat, a.lng], [b.lat, b.lng]];

        // Visible segment
        L.polyline(seg, {
          color: '#3b82f6',
          weight: 3,
          opacity: 0.8,
          dashArray: '10, 5',
          pane: 'routePane',
          interactive: false,
        }).addTo(routeLayerRef.current);

        if (isPlanning) {
          // Invisible wider hit-area to make clicking the line forgiving
          const hit = L.polyline(seg, {
            color: '#3b82f6',
            weight: 20,
            opacity: 0,
            pane: 'routePane',
            interactive: true,
            className: 'route-segment-hit',
            bubblingMouseEvents: false,
          }).addTo(routeLayerRef.current);

          const insertIndex = i + 1;
          hit.on('click', (e: any) => {
            L.DomEvent.stopPropagation(e);
            if (e.originalEvent) L.DomEvent.stop(e.originalEvent);
            const { lat, lng } = e.latlng;
            pushRouteHistory();
            routePointsRef.current.splice(insertIndex, 0, { lat, lng });
            updateRouteDisplay();
            const cb = onRouteChangeRef.current;
            if (cb) {
              const coords = [...routePointsRef.current];
              cb({ coordinates: coords, totalDistance: calculateTotalDistance(coords), areaKm2: calculatePolygonAreaKm2(coords) });
            }
          });
        }
      }
    }


    // Add numbered markers
    points.forEach((point, index) => {
      const isFirst = index === 0;
      const isLast = index === points.length - 1 && points.length > 1;

      let bgColor = '#3b82f6';
      if (isFirst) bgColor = '#22c55e';
      else if (isLast) bgColor = '#ef4444';

      const marker = L.marker([point.lat, point.lng], {
        icon: L.divIcon({
          className: 'route-marker',
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
            cursor: ${modeRef.current === 'routePlanning' ? 'move' : 'default'};
          ">${index + 1}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        draggable: modeRef.current === 'routePlanning',
        pane: 'routePane',
      });

      if (modeRef.current === 'routePlanning') {
        marker.on('dragend', (e: any) => {
          const { lat, lng } = e.target.getLatLng();
          pushRouteHistory();
          routePointsRef.current[index] = { lat, lng };
          updateRouteDisplay();
          const cb = onRouteChangeRef.current;
          if (cb) {
            const coords = [...routePointsRef.current];
            cb({ coordinates: coords, totalDistance: calculateTotalDistance(coords), areaKm2: calculatePolygonAreaKm2(coords) });
          }
        });

        marker.on('contextmenu', (e: any) => {
          L.DomEvent.stopPropagation(e);
          pushRouteHistory();
          routePointsRef.current.splice(index, 1);
          updateRouteDisplay();
          const cb = onRouteChangeRef.current;
          if (cb) {
            const coords = [...routePointsRef.current];
            cb({ coordinates: coords, totalDistance: calculateTotalDistance(coords), areaKm2: calculatePolygonAreaKm2(coords) });
          }
        });
      }

      let popupContent = `<strong>${t('pages.map.routePointPopup.title', { n: index + 1 })}</strong>`;
      if (index > 0) {
        const dist = calculateDistance(points[index - 1].lat, points[index - 1].lng, point.lat, point.lng);
        popupContent += `<br/>${t('pages.map.routePointPopup.distanceFromPrev', { d: dist.toFixed(2) })}`;
      }
      if (modeRef.current === 'routePlanning') {
        popupContent += `<br/><em style="font-size: 11px; color: #666;">${t('pages.map.routePointPopup.dragOrRight')}</em>`;
      }
      marker.bindPopup(popupContent);
      marker.addTo(routeLayerRef.current!);
    });

    // Total distance label
    if (points.length > 1) {
      const totalDist = calculateTotalDistance(points);
      const midPoint = points[Math.floor(points.length / 2)];
      L.marker([midPoint.lat, midPoint.lng], {
        icon: L.divIcon({
          className: 'route-marker',
          html: `<div style="
            background: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            box-shadow: 0 1px 4px rgba(0,0,0,0.2);
            white-space: nowrap;
          ">${t('pages.map.routePointPopup.total', { d: totalDist.toFixed(2) })}</div>`,
          iconSize: [100, 24],
          iconAnchor: [50, -10],
        }),
        interactive: false,
        pane: 'routePane',
      }).addTo(routeLayerRef.current);
    }

    // SORA operational volume zones
    if (!soraLayerRef.current) {
      soraLayerRef.current = L.layerGroup();
      if (leafletMapRef.current) {
        soraLayerRef.current.addTo(leafletMapRef.current);
      }
    }
    soraLayerRef.current.clearLayers();

    const sora = soraSettingsRef.current;
    if (sora?.enabled && points.length >= 1) {
      renderSoraZones(points, sora, soraLayerRef.current);
    }

    // Adjacent area zone
    if (!adjacentAreaLayerRef.current) {
      adjacentAreaLayerRef.current = L.layerGroup();
      if (leafletMapRef.current) {
        adjacentAreaLayerRef.current.addTo(leafletMapRef.current);
      }
    }
    adjacentAreaLayerRef.current.clearLayers();

    const adjRadius = adjacentAreaRadiusMRef.current;
    if (adjRadius && adjRadius > 0 && sora?.enabled && points.length >= 1) {
      renderAdjacentAreaZone(points, adjRadius, adjacentAreaLayerRef.current, sora);
    }

    // SSB 250 m population density cells for the active SORA/adjacent coverage.
    const map = leafletMapRef.current;
    const renderer = map ? getPopulationDensityRenderer(map) : undefined;

    if (!populationDensityLayerRef.current) {
      populationDensityLayerRef.current = L.layerGroup();
      if (leafletMapRef.current) {
        populationDensityLayerRef.current.addTo(leafletMapRef.current);
      }
    }
    populationDensityLayerRef.current.clearLayers();

    const densityCells = populationDensityCellsRef.current ?? [];
    const coveragePolygons = populationDensityCoverageRef.current ?? [];
    if (sora?.enabled && coveragePolygons.length > 0) {
      coveragePolygons.forEach((coverage) => {
        if (coverage.length < 3) return;
        L.polygon(coverage.map(p => [p.lat, p.lng] as [number, number]), {
          pane: 'populationDensityPane',
          renderer,
          interactive: false,
          color: 'hsl(var(--info))',
          fillColor: 'hsl(var(--info))',
          weight: 1,
          opacity: 0.32,
          fillOpacity: 0.07,
          dashArray: '4 4',
          className: 'ssb-density-coverage',
        } as L.PathOptions).addTo(populationDensityLayerRef.current!);
      });
    }
    if (sora?.enabled && densityCells.length > 0) {
      const explicitDriverIndex = densityCells.findIndex((cell) => cell.isDriver);
      const maxDensityIndex = explicitDriverIndex >= 0 ? explicitDriverIndex : densityCells.reduce((bestIndex, cell, index) => {
        const density = cell.densityPerKm2 ?? cell.population * 16;
        const bestCell = densityCells[bestIndex];
        const bestDensity = bestCell ? (bestCell.densityPerKm2 ?? bestCell.population * 16) : -Infinity;
        return density > bestDensity ? index : bestIndex;
      }, 0);
      densityCells.forEach((cell, index) => {
        const isEurostat = cell.source === "eurostat";
        const density = cell.densityPerKm2 ?? (isEurostat ? cell.population : cell.population * 16);
        const isHotspot = index === maxDensityIndex;
        const densityLabel = `${Math.round(density).toLocaleString(dateLocale)} /km²`;
        const sourceLabel = isEurostat ? t('pages.map.density.sourceEurostat') : t('pages.map.density.sourceSsb');
        const densityCalc = isEurostat
          ? t('pages.map.density.eurostatCalc', { n: density.toLocaleString(dateLocale) })
          : t('pages.map.density.ssbCalc', { n: density.toLocaleString(dateLocale) });
        const popup = `<strong>${sourceLabel}</strong><br/>${t('pages.map.density.peopleInRoute', { n: cell.population.toLocaleString(dateLocale) })}<br/>${densityCalc}${isHotspot ? `<br/><strong>${t('pages.map.density.driverForCalc')}</strong>` : ''}`;
        const tooltip = t('pages.map.density.driverTooltip', { label: densityLabel });
        const tooltipOptions: L.TooltipOptions = {
          permanent: true,
          direction: 'center',
          className: 'ssb-density-label ssb-density-label-hotspot',
          opacity: 1,
        };
        const interactive = modeRef.current !== 'routePlanning';

        if (cell.polygon && cell.polygon.length >= 3) {
          const polygon = L.polygon(cell.polygon.map(p => [p.lat, p.lng] as [number, number]), { ...getPopulationDensityStyle(density, isHotspot), renderer, interactive })
            .bindPopup(popup);
          if (isHotspot) polygon.bindTooltip(tooltip, tooltipOptions);
          polygon.addTo(populationDensityLayerRef.current!);
        } else {
          const marker = L.circleMarker([cell.centroidLat, cell.centroidLng], {
            ...getPopulationDensityStyle(density, isHotspot),
            interactive,
            radius: isHotspot ? 7 : 4,
          }).bindPopup(popup);
          if (isHotspot) marker.bindTooltip(tooltip, tooltipOptions);
          marker.addTo(populationDensityLayerRef.current!);
        }
      });
    }
  }, [getPopulationDensityRenderer]);

  // Sync soraSettings ref and redraw
  useEffect(() => {
    soraSettingsRef.current = soraSettings;
    adjacentAreaRadiusMRef.current = adjacentAreaRadiusM;
    populationDensityCellsRef.current = populationDensityCells;
    populationDensityCoverageRef.current = populationDensityCoveragePolygons;
    if (routeLayerRef.current && leafletMapRef.current) {
      updateRouteDisplay();
    }
  }, [soraSettings, adjacentAreaRadiusM, populationDensityCells, populationDensityCoveragePolygons, updateRouteDisplay]);

  // Sync mode ref and toggle interactivity
  useEffect(() => {
    modeRef.current = mode;

    const vectorsInteractive = mode !== "routePlanning";
    setGeoJsonInteractivity(nsmGeoJsonRef.current, vectorsInteractive);
    setGeoJsonInteractivity(rpasGeoJsonRef.current, vectorsInteractive);
    aipGeoJsonLayersRef.current.forEach(layer => {
      setGeoJsonInteractivity(layer, vectorsInteractive);
    });

    if (leafletMapRef.current) {
      syncRoutePlanningInteractivity(mode, routeInspectModeRef.current);
    }

    if (routeLayerRef.current && leafletMapRef.current) {
      updateRouteDisplay();
    }
  }, [mode, updateRouteDisplay, setGeoJsonInteractivity, syncRoutePlanningInteractivity]);

  // Sync with controlled route from parent
  useEffect(() => {
    if (!controlledRoute) return;
    const controlled = controlledRoute.coordinates;
    const current = routePointsRef.current;
    const firstChanged =
      controlled.length > 0 && current.length > 0 &&
      (controlled[0].lat !== current[0].lat || controlled[0].lng !== current[0].lng);
    const lengthDiffers = controlled.length !== current.length;
    let contentDiffers = false;
    if (!lengthDiffers) {
      for (let i = 0; i < controlled.length; i++) {
        if (controlled[i].lat !== current[i].lat || controlled[i].lng !== current[i].lng) {
          contentDiffers = true;
          break;
        }
      }
    }
    if (lengthDiffers || contentDiffers || firstChanged) {
      const wasEmpty = current.length === 0;
      routeHistoryRef.current = [];
      routePointsRef.current = [...controlled];
      setRoutePointCount(routePointsRef.current.length);
      updateRouteDisplay();
      if (controlled.length > 0 && leafletMapRef.current && (wasEmpty || firstChanged)) {
        // When an explicit mission center is supplied, let the initialCenter effect
        // keep the map centered on the mission instead of snapping to the first point.
        if (!initialCenter) {
          leafletMapRef.current.setView([controlled[0].lat, controlled[0].lng], leafletMapRef.current.getZoom());
        }
      }
    }
  }, [controlledRoute, updateRouteDisplay]);

  // ==================== MAIN MAP INIT useEffect ====================
  useEffect(() => {
    if (!mapRef.current || !profileLoaded || !companyDefaultLayersLoaded) return;

    const startCenter = initialCenter || DEFAULT_POS;
    const map = L.map(mapRef.current, {
      zoomControl: false,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
    }).setView(startCenter, initialCenter ? 13 : 8);
    const zoomCtrl = L.control.zoom({ position: 'topright' }).addTo(map);
    // Push zoom control below the right-side action buttons
    // (vær + base + 3D + kartlag + rute = 5 × 40 px + 4 × 8 px gap + top-4 16 px ≈ 260 px)
    const zoomEl = (zoomCtrl as any).getContainer?.() as HTMLElement | undefined;
    if (zoomEl) { zoomEl.style.marginTop = '260px'; }
    leafletMapRef.current = map;

    // Notify parent (Kart) of viewport changes so 2D/3D can stay in sync.
    if (onViewChange) {
      const emitView = () => {
        try {
          const c = map.getCenter();
          onViewChange([c.lat, c.lng], map.getZoom());
        } catch {}
      };
      map.on('moveend', emitView);
      map.on('zoomend', emitView);
    }

    // Dynamic scale for AIS vessel icons (manual NAIS + route-proximity)
    const updateVesselScale = () => {
      const container = map.getContainer();
      if (container) {
        container.style.setProperty('--ais-vessel-scale', String(computeVesselScale(map.getZoom())));
      }
    };
    updateVesselScale();
    map.on('zoomend', updateVesselScale);

    // Create panes
    const paneConfig: Record<string, string> = {
      safeskyPane: '750', liveFlightPane: '720', historicalFlightPane: '715', missionPane: '680', notamPinPane: '675', airportPane: '670', routePane: '665',
      powerPane: '700', tensioPowerPane: '699', obstaclePane: '660', nsmPane: '650', atzPane: '645', notamPane: '640', populationDensityPane: '635',
      rpasPane: '630', aipPane: '625', rmzPane: '620',
    };
    const nonInteractivePanes = new Set(ROUTE_PLANNING_NON_INTERACTIVE_PANES);
    for (const [paneName, zIndex] of Object.entries(paneConfig)) {
      map.createPane(paneName);
      const pane = map.getPane(paneName);
      if (pane) {
        pane.style.zIndex = zIndex;
        pane.style.pointerEvents = (mode === 'routePlanning' && nonInteractivePanes.has(paneName)) ? 'none' : 'auto';
      }
    }
    ensurePopulationDensityPane(map);
    ensureRouteProximityPane(map);
    populationDensityRendererRef.current = L.svg({ pane: 'populationDensityPane' });

    // Sørg for at popup-bokser alltid ligger over alle kartlag
    const popupPane = map.getPane('popupPane');
    if (popupPane) popupPane.style.zIndex = '800';
    const tooltipPane = map.getPane('tooltipPane');
    if (tooltipPane) tooltipPane.style.zIndex = '790';

    // Base layer
    const osmLayer = L.tileLayer(openAipConfig.tiles.base, {
      attribution: openAipConfig.attribution.osm,
      subdomains: "abc",
    }).addTo(map);
    baseLayerRef.current = osmLayer;

    const layerConfigs: LayerConfig[] = [];
    let tensioLuftnettLayer: L.TileLayer.WMS | null = null;

    // ============================================================
    // LUFTROM
    // ============================================================
    if (openAipConfig.apiKey && openAipConfig.tiles.airspace) {
      const airspaceUrl = openAipConfig.tiles.airspace.replace("{key}", openAipConfig.apiKey);
      const airspaceLayer = L.tileLayer(airspaceUrl, { opacity: 0.55, subdomains: "abc" }).addTo(map);
      layerConfigs.push({ id: "airspace", name: t('pages.map.layers.airspace'), layer: airspaceLayer, enabled: true, icon: "layers", group: t('pages.map.layers.groups.airspace') });
    }

    const rpasLayer = L.layerGroup().addTo(map);
    const nsmLayer = L.layerGroup().addTo(map);
    const aipLayer = L.layerGroup();
    const rmzTmzAtzLayer = L.layerGroup().addTo(map);

    // ============================================================
    // VERNEOMRÅDER + DK NATUR — slått sammen (auto når kartet er over DK)
    // ============================================================
    const naturvernLayer = L.layerGroup();
    const dkNatureLayer = L.layerGroup();

    // ============================================================
    // CAA dronesoner (Luftfartstilsynet — dronesoner.no)
    // ============================================================
    const caaFengslerLayer = L.layerGroup();
    const caaAmbassaderLayer = L.layerGroup();
    const caaFareLayer = L.layerGroup();
    const caaFlyplasserLayer = L.layerGroup().addTo(map);
    const caaNotamSonerLayer = L.layerGroup();
    const caaRestriksjonerLayer = L.layerGroup();

    // ============================================================
    // 🇩🇰 Trafikstyrelsen dronezoner
    // ============================================================
    const dkRodLayer = L.layerGroup();
    const dkOrangeLayer = L.layerGroup();
    const dkBlaLayer = L.layerGroup();

    // ============================================================
    // 🇪🇺 Unified airspace zones (DK/SE/DE/FI) — Phase C1
    // Only rendered for companies in `airspace_unified_company_allowlist`.
    // For everyone else these layers stay empty (fetcher never called).
    // NO is intentionally excluded — legacy code path is authoritative there.
    // ============================================================
    const unifiedAirspaceLayer = L.layerGroup();      // CTR/TIZ/ATZ (layer_id='airspace')
    const unifiedRpasLayer = L.layerGroup();          // DRONE_NO_FLY (layer_id='rpas')
    const unifiedRestrictedLayer = L.layerGroup();    // R (layer_id='restriksjonsomrader')
    const unifiedDangerLayer = L.layerGroup();        // DRONE_DANGER (layer_id='fareomrader')
    const unifiedSecurityLayer = L.layerGroup();      // DRONE_PROTECTED_OBJECT (layer_id='sikringsobjekter')
    const unifiedNatureLayer = L.layerGroup();        // NATURE (layer_id='verneomrader')

    // NRL (vises sammen med OpenAIP-hindringer under "Luftfartshindre")
    const nrlLayer = L.tileLayer.wms("https://wms.geonorge.no/skwms1/wms.nrl5?", {
      layers: "nrlflate,nrllinje,nrlluftspenn,nrlmast,nrlpunkt", format: "image/png", transparent: true, opacity: 0.8, attribution: 'NRL Luftfartshindre',
    });

    // SSB Arealbruk
    const arealbrukLayer = L.tileLayer.wms("https://wms.geonorge.no/skwms1/wms.arealbruk?", {
      layers: "arealbruk", format: "image/png", transparent: true, opacity: 0.6, attribution: "SSB Arealbruk", minZoom: 0, maxZoom: 20, tiled: true,
    } as any);

    // Befolkningstetthet — Norge (SSB) + Europa (Eurostat) slått sammen
    const ssbBefolkningLayer = L.tileLayer.wms("https://kart.ssb.no/api/mapserver/v1/wms/befolkning_paa_rutenett", {
      layers: "befolkning_1km_2025", format: "image/png", transparent: true, opacity: 0.7,
      attribution: 'Befolkning 1km² © <a href="https://www.ssb.no">SSB</a>', minZoom: 0, maxZoom: 20, tiled: true, version: "1.3.0",
    } as any);
    const eurostatPopLayer = L.tileLayer.wms("https://gisco-services.ec.europa.eu/maps/service", {
      layers: "PopulationGrid2021", format: "image/png", transparent: true, opacity: 0.6,
      attribution: '© European Commission – Eurostat (GISCO)', version: "1.3.0",
      minZoom: 4, maxZoom: 18, maxNativeZoom: 10, tiled: true, updateWhenIdle: true, keepBuffer: 1,
    } as any);

    // SSB Tettsteder
    const tettstederLayer = L.tileLayer.wms("https://kart.ssb.no/api/mapserver/v1/wms/tettsteder", {
      layers: "tettsted_2024", format: "image/png", transparent: true, opacity: 0.5,
      attribution: 'Tettsteder © <a href="https://www.ssb.no">SSB</a>', minZoom: 0, maxZoom: 20, tiled: true, version: "1.3.0",
    } as any);

    // Tensio luftnett
    if (isTensioHierarchy) {
      tensioLuftnettLayer = L.tileLayer.wms(TENSIO_WMS_URL, {
        layers: "0,1,2,3,4,5,6,7,8,9",
        format: "image/png",
        transparent: true,
        opacity: 0.75,
        attribution: "Tensio luftnett",
        version: "1.3.0",
        pane: "tensioPowerPane",
      } as any).addTo(map);
    }

    // NVE Kraftledninger
    const kraftledningerLayer = L.layerGroup();

    // Kartverket Matrikkelen — eiendomsgrenser (gnr/bnr)
    const eiendomsgrenserLayer = L.tileLayer.wms(
      "https://wms.geonorge.no/skwms1/wms.matrikkel?",
      {
        layers: "eiendomsgrense,grensepunkt,eiendoms_id",
        format: "image/png",
        transparent: true,
        opacity: 0.9,
        attribution: "© Kartverket – Matrikkelen",
        version: "1.3.0",
        minZoom: 14,
        tiled: true,
      } as any
    );

    // NAIS skipstrafikk
    if (!map.getPane('naisPane')) {
      map.createPane('naisPane');
      map.getPane('naisPane')!.style.zIndex = '695';
    }
    const naisLayer = L.layerGroup();
    naisLayerRef.current = naisLayer;

    // NOTAM (live RSS + CAA-soner slått sammen)
    const notamLayer = L.layerGroup().addTo(map);
    const obstaclesLayer = L.layerGroup();
    obstaclesLayerRef.current = obstaclesLayer;
    const airportsLayer = L.layerGroup().addTo(map);

    // ============================================================
    // BYGG LAYER-KONFIGURASJON med grupper og sammenslåtte toggles
    // ============================================================

    // Luftrom
    const gAir = t('pages.map.layers.groups.airspace');
    const gRes = t('pages.map.layers.groups.restrictions');
    const gNat = t('pages.map.layers.groups.natureAndPopulation');
    const gInf = t('pages.map.layers.groups.infrastructure');
    const gMis = t('pages.map.layers.groups.missions');
    const gLive = t('pages.map.layers.groups.liveTraffic');
    layerConfigs.push({ id: "rpas", name: t('pages.map.layers.rpas'), layer: [rpasLayer, unifiedRpasLayer], enabled: true, icon: "radio", group: gAir });
    layerConfigs.push({ id: "nsm", name: t('pages.map.layers.nsm'), layer: nsmLayer, enabled: true, icon: "ban", group: gAir });
    layerConfigs.push({ id: "aip", name: t('pages.map.layers.prd'), layer: [aipLayer, unifiedAirspaceLayer], enabled: false, icon: "shield", group: gAir });
    layerConfigs.push({ id: "rmz_tmz_atz", name: t('pages.map.layers.rmzTmzAtz'), layer: rmzTmzAtzLayer, enabled: true, icon: "radio", group: gAir });

    // Restriksjoner — slått sammen NO + DK + unified (SE/DE/FI/DK)
    layerConfigs.push({ id: "restriksjonsomrader", name: t('pages.map.layers.restrictedAreas'), layer: [caaRestriksjonerLayer, dkRodLayer, unifiedRestrictedLayer], enabled: false, icon: "ban", group: gRes });
    layerConfigs.push({ id: "fareomrader", name: t('pages.map.layers.dangerAreas'), layer: [caaFareLayer, dkOrangeLayer, unifiedDangerLayer], enabled: false, icon: "alertTriangle", group: gRes });
    layerConfigs.push({ id: "sikringsobjekter", name: t('pages.map.layers.securityObjects'), layer: [caaFengslerLayer, caaAmbassaderLayer, dkBlaLayer, unifiedSecurityLayer], enabled: false, icon: "shield", group: gRes });
    layerConfigs.push({ id: "notam", name: t('pages.map.layers.notam'), layer: [notamLayer, caaNotamSonerLayer], enabled: true, icon: "alertTriangle", group: gRes });

    // Natur & befolkning
    layerConfigs.push({ id: "verneomrader", name: t('pages.map.layers.protectedAreas'), layer: [naturvernLayer, dkNatureLayer, unifiedNatureLayer], enabled: false, icon: "treePine", group: gNat });
    layerConfigs.push({ id: "befolkning", name: t('pages.map.layers.population'), layer: [eurostatPopLayer, ssbBefolkningLayer], enabled: false, icon: "users", group: gNat });
    layerConfigs.push({ id: "tettsteder", name: t('pages.map.layers.urbanAreas'), layer: tettstederLayer, enabled: false, icon: "users", group: gNat });
    layerConfigs.push({ id: "arealbruk", name: t('pages.map.layers.landUse'), layer: arealbrukLayer, enabled: false, icon: "users", group: gNat });

    // Infrastruktur
    layerConfigs.push({ id: "luftfartshindre", name: t('pages.map.layers.aviationObstacles'), layer: [nrlLayer, obstaclesLayer], enabled: false, icon: "alertTriangle", group: gInf });
    layerConfigs.push({ id: "kraftledninger", name: t('pages.map.layers.powerLines'), layer: kraftledningerLayer, enabled: false, icon: "zap", group: gInf });
    layerConfigs.push({ id: "eiendomsgrenser", name: t('pages.map.layers.propertyBoundaries'), layer: eiendomsgrenserLayer, enabled: false, icon: "mapPin", group: gInf });
    if (tensioLuftnettLayer) {
      layerConfigs.push({ id: "tensio_luftnett", name: t('pages.map.layers.tensioPowerGrid'), layer: tensioLuftnettLayer, enabled: true, icon: "zap", group: gInf });
    }
    layerConfigs.push({ id: "flyplasser", name: t('pages.map.layers.airports'), layer: [airportsLayer, caaFlyplasserLayer], enabled: true, icon: "planeLanding", group: gInf });

    // Geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          if (userMarkerRef.current) {
            userMarkerRef.current.setLatLng(coords);
          } else {
            userMarkerRef.current = L.circleMarker(coords, {
              radius: 8, fillColor: '#3b82f6', fillOpacity: 1, color: '#ffffff', weight: 2,
            }).addTo(map);
            userMarkerRef.current.bindPopup(t('pages.map.yourPosition'));
          }
          // Only center on the user's position if we have not been given an explicit
          // mission center and we are not focusing on a specific flight.
          if (!suppressGeolocationCenterRef.current && !initialCenter && !focusFlightIdRef.current) {
            map.setView(coords, 9);
          }
        },
        () => {
          console.log("Geolokasjon nektet");
          if (!suppressGeolocationCenterRef.current && !initialCenter && !focusFlightIdRef.current && companyLat && companyLon) {
            map.setView([companyLat, companyLon], 10);
          }
        },
      );
    }

    // Drone, Missions, SafeSky, Route, Pilot, Advisory layers
    const droneLayer = L.layerGroup().addTo(map);
    layerConfigs.push({ id: "drones", name: t('pages.map.layers.drones'), layer: droneLayer, enabled: true, icon: "navigation", group: gLive });

    const missionsLayer = L.layerGroup();
    if (modeRef.current === "view") missionsLayer.addTo(map);
    missionsLayerRef.current = missionsLayer;
    layerConfigs.push({ id: "missions", name: t('pages.map.layers.missions_'), layer: missionsLayer, enabled: modeRef.current === "view", icon: "mapPin", group: gMis });

    const completedMissionsLayer = L.layerGroup();
    layerConfigs.push({ id: "completed_missions", name: t('pages.map.layers.completedMissions'), layer: completedMissionsLayer, enabled: false, icon: "mapPin", group: gMis });

    const plannedPublishedLayer = L.layerGroup();
    if (modeRef.current === "view") plannedPublishedLayer.addTo(map);
    plannedPublishedLayerRef.current = plannedPublishedLayer;
    layerConfigs.push({ id: "planned_published", name: t('pages.map.layers.plannedShared'), layer: plannedPublishedLayer, enabled: modeRef.current === "view", icon: "mapPin", group: gMis });

    const safeskyLayer = L.layerGroup().addTo(map);
    layerConfigs.push({ id: "safesky", name: t('pages.map.layers.airTraffic'), layer: safeskyLayer, enabled: true, icon: "radar", group: gLive });
    layerConfigs.push({ id: "nais", name: t('pages.map.layers.shipTraffic'), layer: naisLayer, enabled: false, icon: "navigation", group: gLive });

    const routeLayer = L.layerGroup().addTo(map);
    routeLayerRef.current = routeLayer;
    const routeProximityLayer = L.layerGroup().addTo(map);
    routeProximityLayerRef.current = routeProximityLayer;
    routePlanningInteractiveLayerRefs.current = [
      rpasLayer,
      nsmLayer,
      aipLayer,
      rmzTmzAtzLayer,
      naturvernLayer,
      dkNatureLayer,
      caaFengslerLayer,
      caaAmbassaderLayer,
      caaFareLayer,
      caaFlyplasserLayer,
      caaNotamSonerLayer,
      caaRestriksjonerLayer,
      dkRodLayer,
      dkOrangeLayer,
      dkBlaLayer,
      unifiedAirspaceLayer,
      unifiedRpasLayer,
      unifiedRestrictedLayer,
      unifiedDangerLayer,
      unifiedSecurityLayer,
      unifiedNatureLayer,
      notamLayer,
      obstaclesLayer,
      airportsLayer,
      droneLayer,
      safeskyLayer,
      missionsLayer,
      completedMissionsLayer,
      plannedPublishedLayer,
      kraftledningerLayer,
      naisLayer,
      routeProximityLayer,
    ];
    syncRoutePlanningInteractivity(modeRef.current, routeInspectModeRef.current);
    if (routePointsRef.current.length > 0) {
      updateRouteDisplay();
    }

    const pilotLayer = L.layerGroup().addTo(map);
    pilotLayerRef.current = pilotLayer;

    const activeAdvisoryLayer = L.layerGroup().addTo(map);
    const pilotPositionsLayer = L.layerGroup().addTo(map);

    // Apply company-level "Standard kartlag" overrides. For each catalog entry the
    // company has explicitly set, sync both the LayerConfig.enabled flag and the
    // underlying Leaflet layer's presence on the map so `/kart` opens with the
    // admin-chosen defaults instead of the hardcoded ones.
    const companyDefaults = companyDefaultLayersRef.current;
    const applyCompanyDefaults = (cfg: LayerConfig): LayerConfig => {
      const catalogEntry = MAP_LAYER_CATALOG.find((e) => e.id === cfg.id);
      if (!catalogEntry) return cfg; // dynamic/mode-controlled layer — never overridden
      if (!Object.prototype.hasOwnProperty.call(companyDefaults, cfg.id)) return cfg;
      const override = !!companyDefaults[cfg.id];
      if (override === cfg.enabled) return cfg;
      const arr = Array.isArray(cfg.layer) ? cfg.layer : [cfg.layer];
      if (override) {
        arr.forEach((l) => { if (!map.hasLayer(l)) l.addTo(map); });
      } else {
        arr.forEach((l) => { if (map.hasLayer(l)) map.removeLayer(l); });
      }
      return { ...cfg, enabled: override };
    };
    const reconciledLayerConfigs = layerConfigs.map(applyCompanyDefaults);
    setLayers(reconciledLayerConfigs);

    // Common fetch params
    const geoJsonParams = {
      mode,
      setGeoJsonInteractivity,
      modeRef,
    };

    // Map click handler
    const handleMapClick = async (e: any) => {
      const target = e.originalEvent?.target as HTMLElement | null | undefined;
      const isRouteDrawingClick = modeRef.current === "routePlanning" && !routeInspectModeRef.current;
      if (target?.closest('.leaflet-popup, .leaflet-popup-content-wrapper, .route-segment-hit')) return;
      if (!isRouteDrawingClick && target?.closest('.leaflet-marker-icon')) return;
      
      const { lat, lng } = e.latlng;
      
      if (isPlacingPilotRef.current) {
        const cb = onPilotPositionChangeRef.current;
        if (cb) cb({ lat, lng });
        return;
      }
      
      if (modeRef.current === "routePlanning" && !routeInspectModeRef.current) {
        pushRouteHistory();
        routePointsRef.current.push({ lat, lng });
        setRoutePointCount(routePointsRef.current.length);
        updateRouteDisplay();
        const cb = onRouteChangeRef.current;
        if (cb) {
          const coords = [...routePointsRef.current];
          cb({ coordinates: coords, totalDistance: calculateTotalDistance(coords), areaKm2: calculatePolygonAreaKm2(coords) });
        }
      } else if (weatherEnabledRef.current) {
        showWeatherPopup(map, lat, lng);
      } else if (isTensioHierarchy && tensioLuftnettLayer && map.hasLayer(tensioLuftnettLayer)) {
        try {
          const response = await fetch(buildTensioFeatureInfoUrl(map, e.latlng));
          if (!response.ok) return;
          const data = await response.json();
          const feature = data?.features?.find((item: any) => item?.properties && Object.keys(item.properties).length > 0);
          if (feature?.properties) {
            L.popup({ maxWidth: 300 })
              .setLatLng(e.latlng)
              .setContent(formatFeatureInfoPopup("Luftnett Tensio", feature.properties))
              .openOn(map);
          }
        } catch (err) {
          try {
            const fallback = await fetch(buildTensioFeatureInfoUrl(map, e.latlng, "text/plain"));
            const popup = fallback.ok ? formatPlainFeatureInfoPopup("Luftnett Tensio", await fallback.text()) : "";
            if (popup) L.popup({ maxWidth: 300 }).setLatLng(e.latlng).setContent(popup).openOn(map);
          } catch (fallbackErr) {
            console.warn("Kunne ikke hente Tensio objektinformasjon:", fallbackErr);
          }
        }
      } else if (map.hasLayer(eiendomsgrenserLayer)) {
        try {
          const size = map.getSize();
          const point = map.latLngToContainerPoint(e.latlng);
          const bounds = map.getBounds();
          const sw = bounds.getSouthWest();
          const ne = bounds.getNorthEast();
          const params = new URLSearchParams({
            service: "WMS",
            version: "1.3.0",
            request: "GetFeatureInfo",
            layers: "eiendomsgrense",
            query_layers: "eiendomsgrense",
            crs: "CRS:84",
            bbox: `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`,
            width: String(size.x),
            height: String(size.y),
            i: String(Math.round(point.x)),
            j: String(Math.round(point.y)),
            info_format: "application/json",
          });
          const url = `https://wms.geonorge.no/skwms1/wms.matrikkel?${params.toString()}`;
          const response = await fetch(url);
          if (!response.ok) return;
          const data = await response.json();
          const feature = data?.features?.find((f: any) => f?.properties && Object.keys(f.properties).length > 0);
          if (feature?.properties) {
            L.popup({ maxWidth: 320 })
              .setLatLng(e.latlng)
              .setContent(formatFeatureInfoPopup("Eiendom (matrikkel)", feature.properties))
              .openOn(map);
          }
        } catch (err) {
          console.warn("Kunne ikke hente matrikkelinfo:", err);
        }
      }
    };

    map.on('click', handleMapClick);

    // Heartbeat is now handled globally by useAppHeartbeat hook

    // SafeSky manager
    const safeSkyManager = createSafeSkyManager({ safeskyLayer, mode });
    (map as any)._safeskyControls = { start: safeSkyManager.start, stop: safeSkyManager.stop };

    // Start ALL layers immediately — AuthContext handles session validity,
    // Supabase SDK auto-attaches the JWT from localStorage for RLS queries.
    safeSkyManager.start();
    // Honor company "Standard kartlag" override for SafeSky (special side-effect layer).
    if (companyDefaults.safesky === false) safeSkyManager.stop();
    fetchNsmData({ ...geoJsonParams, mode: modeRef.current, layer: nsmLayer, geoJsonRef: nsmGeoJsonRef });
    fetchRpasData({ ...geoJsonParams, mode: modeRef.current, layer: rpasLayer, geoJsonRef: rpasGeoJsonRef });
    fetchAllAipZones({ ...geoJsonParams, mode: modeRef.current, layer: aipLayer, aipLayer, rmzTmzAtzLayer, aipGeoJsonLayersRef });
    fetchObstacles({ layer: obstaclesLayer, mode: modeRef.current });
    fetchAirportsData({ layer: airportsLayer, mode: modeRef.current });
    fetchDroneTelemetry({ droneLayer, modeRef });
    fetchAndDisplayMissions({ missionsLayer, completedMissionsLayer, modeRef, onMissionClickRef });
    fetchAndDisplayPlannedMissionPublications({ layer: plannedPublishedLayer, modeRef, windowHours: plannedWindowHoursRef.current });
    fetchActiveAdvisories({ activeAdvisoryLayer, flightMarkersRef });
    fetchPilotPositions({ pilotPositionsLayer, flightMarkersRef, mode });
    fetchNotams({ layer: notamLayer, pane: 'notamPane', pinPane: 'notamPinPane', mode });
    // Viewport-based verneområder fetching with debounce
    const fetchVerneomraader = () => {
      if (map.getZoom() < 10) {
        resetCache('naturvern', naturvernLayer);
        resetCache('vernRestriction', naturvernLayer);
        return;
      }
      const b = map.getBounds();
      const bounds = {
        minLat: b.getSouth(),
        minLng: b.getWest(),
        maxLat: b.getNorth(),
        maxLng: b.getEast(),
      };
      // Diff-render inside fetchers — no pre-clear (eliminates flicker)
      fetchNaturvernZones({ layer: naturvernLayer, mode, bounds });
      fetchVernRestrictionZones({ layer: naturvernLayer, mode, bounds });
    };

    // CAA dronesoner: refetch on moveend per aktivert lag
    const caaLayerMap: Array<[string, L.LayerGroup]> = [
      ['fengsler', caaFengslerLayer],
      ['ambassader', caaAmbassaderLayer],
      ['fareomrader', caaFareLayer],
      ['flyplasser', caaFlyplasserLayer],
      ['notam_soner', caaNotamSonerLayer],
      ['restriksjoner', caaRestriksjonerLayer],
    ];
    const fetchCaaLayers = () => {
      if (map.getZoom() < 9) {
        caaLayerMap.forEach(([layerId, lg]) => resetCache(`caa:${layerId}`, lg));
        return;
      }
      const b = map.getBounds();
      const bounds = {
        minLat: b.getSouth(), minLng: b.getWest(),
        maxLat: b.getNorth(), maxLng: b.getEast(),
      };
      caaLayerMap.forEach(([layerId, lg]) => {
        if (map.hasLayer(lg)) {
          // Diff-render inside fetcher — no pre-clear (eliminates flicker)
          fetchCaaDroneZones({ layer: lg, mode: modeRef.current, bounds, layerIds: [layerId] });
        }
      });
    };

    // 🇩🇰 DK lag: refetch på samme måte som CAA
    const dkDroneLayerMap: Array<[string, L.LayerGroup]> = [
      ['rod', dkRodLayer],
      ['orange', dkOrangeLayer],
      ['bla', dkBlaLayer],
    ];
    const fetchDkLayers = () => {
      const z = map.getZoom();
      const b = map.getBounds();
      const bounds = {
        minLat: b.getSouth(), minLng: b.getWest(),
        maxLat: b.getNorth(), maxLng: b.getEast(),
      };
      if (z < 7) {
        dkDroneLayerMap.forEach(([layerId, lg]) => resetCache(`dk:${layerId}`, lg));
      } else {
        dkDroneLayerMap.forEach(([layerId, lg]) => {
          if (map.hasLayer(lg)) {
            fetchDkDroneZones({ layer: lg, mode: modeRef.current, bounds, layerIds: [layerId] });
          }
        });
      }
      // Naturområder — bare 140 totalt, last fra zoom >= 6
      if (map.hasLayer(dkNatureLayer)) {
        if (z >= 6) {
          fetchDkNatureAreas({ layer: dkNatureLayer, mode: modeRef.current, bounds, includeInactive: true });
        } else {
          resetCache('dkNature', dkNatureLayer);
        }
      }
    };

    let vernDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetchVern = () => {
      if (vernDebounceTimer) clearTimeout(vernDebounceTimer);
      vernDebounceTimer = setTimeout(() => {
        fetchVerneomraader();
        fetchCaaLayers();
        fetchDkLayers();
      }, 300);
    };

    // Initial fetch + listen for map moves
    fetchVerneomraader();
    fetchCaaLayers();
    fetchDkLayers();
    map.on('moveend', debouncedFetchVern);
    // Refetch CAA/DK layers when user toggles them on (layeradd fires on .addTo(map))
    map.on('layeradd', (e: any) => {
      const caaMatch = caaLayerMap.find(([, lg]) => lg === e.layer);
      if (caaMatch) fetchCaaLayers();
      const dkMatch = [...dkDroneLayerMap.map(([, lg]) => lg), dkNatureLayer].includes(e.layer);
      if (dkMatch) fetchDkLayers();
    });
    // Reset cache + clear features when CAA/DK/kraft/nais lag toggles off, so re-toggle fetches fresh
    map.on('layerremove', (e: any) => {
      const caaMatch = caaLayerMap.find(([, lg]) => lg === e.layer);
      if (caaMatch) resetCache(`caa:${caaMatch[0]}`, caaMatch[1]);
      const dkMatch = dkDroneLayerMap.find(([, lg]) => lg === e.layer);
      if (dkMatch) resetCache(`dk:${dkMatch[0]}`, dkMatch[1]);
      if (e.layer === dkNatureLayer) resetCache('dkNature', dkNatureLayer);
      if (e.layer === kraftledningerLayer) resetCache('kraft', kraftledningerLayer);
      if (e.layer === naisLayer) resetCache('ais', naisLayer);
    });

    // Befolkning: bytter mellom SSB (Norge) og Eurostat (Europa) basert på kartsenter
    const isCenterInNorway = (): boolean => {
      const c = map.getCenter();
      return c.lat >= 57.5 && c.lat <= 71.5 && c.lng >= 4 && c.lng <= 32;
    };
    const syncBefolkningSource = () => {
      const inNorway = isCenterInNorway();
      if (inNorway) {
        if (map.hasLayer(eurostatPopLayer)) eurostatPopLayer.remove();
        if (!map.hasLayer(ssbBefolkningLayer)) ssbBefolkningLayer.addTo(map);
        setBefolkningSource('ssb');
      } else {
        if (map.hasLayer(ssbBefolkningLayer)) ssbBefolkningLayer.remove();
        if (!map.hasLayer(eurostatPopLayer)) eurostatPopLayer.addTo(map);
        setBefolkningSource('eurostat');
      }
    };
    (map as any)._befolkningControls = {
      sync: syncBefolkningSource,
      isCenterInNorway,
      removeAll: () => {
        if (map.hasLayer(ssbBefolkningLayer)) ssbBefolkningLayer.remove();
        if (map.hasLayer(eurostatPopLayer)) eurostatPopLayer.remove();
      },
    };
    map.on('moveend', () => {
      // Bare bytte hvis ett av lagene allerede er aktivt
      if (map.hasLayer(ssbBefolkningLayer) || map.hasLayer(eurostatPopLayer)) {
        syncBefolkningSource();
      }
    });

    // Kraftledninger: refetch on moveend if layer is enabled
    let kraftDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetchKraft = () => {
      if (kraftDebounceTimer) clearTimeout(kraftDebounceTimer);
      kraftDebounceTimer = setTimeout(() => {
        // Check if layer is currently enabled
        const isEnabled = kraftledningerLayer && (map.hasLayer(kraftledningerLayer));
        if (isEnabled) {
          fetchKraftledningerInBounds({
            layer: kraftledningerLayer,
            bounds: map.getBounds(),
            zoom: map.getZoom(),
            pane: 'powerPane',
            mode: modeRef.current,
          });
        }
      }, 500);
    };
    map.on('moveend', debouncedFetchKraft);

    // NAIS: refetch on moveend if layer is enabled
    let naisDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetchNais = () => {
      if (naisDebounceTimer) clearTimeout(naisDebounceTimer);
      naisDebounceTimer = setTimeout(() => {
        const isEnabled = naisLayer && map.hasLayer(naisLayer);
        if (isEnabled) {
          fetchAisVesselsInBounds({
            layer: naisLayer,
            bounds: map.getBounds(),
            zoom: map.getZoom(),
            pane: 'naisPane',
            mode: modeRef.current,
          });
        }
      }, 500);
    };
    map.on('moveend', debouncedFetchNais);

    // NOTAM: refetch on moveend if layer is enabled

    const droneInterval = setInterval(() => fetchDroneTelemetry({ droneLayer, modeRef }), 15000);
    const plannedInterval = setInterval(() => fetchAndDisplayPlannedMissionPublications({ layer: plannedPublishedLayer, modeRef, windowHours: plannedWindowHoursRef.current }), 5 * 60 * 1000);

    // Real-time subscriptions
    const mapChannel = createUniqueChannel('kart-main')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missions' }, () => fetchAndDisplayMissions({ missionsLayer, completedMissionsLayer, modeRef, onMissionClickRef }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mission_map_publications' }, () => fetchAndDisplayPlannedMissionPublications({ layer: plannedPublishedLayer, modeRef, windowHours: plannedWindowHoursRef.current }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drone_telemetry' }, () => fetchDroneTelemetry({ droneLayer, modeRef }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_flights' }, () => {
        fetchActiveAdvisories({ activeAdvisoryLayer, flightMarkersRef });
        fetchPilotPositions({ pilotPositionsLayer, flightMarkersRef, mode });
      })
      .subscribe();

    // Visibility change handler — refresh map when returning from background
    let lastHiddenAt = 0;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenAt = Date.now();
        return;
      }
      // Only refresh if tab was hidden for > 5 seconds
      if (document.visibilityState === 'visible' && lastHiddenAt > 0 && Date.now() - lastHiddenAt > 5000) {
        console.log('Map: tab returned after background, refreshing layers');
        
        // 1. Force Leaflet to recalculate container and re-render tiles
        map.invalidateSize();
        
        // 2. Restart SafeSky (stop clears stale intervals, start re-triggers warm-up)
        safeSkyManager.stop();
        safeSkyManager.start();
        
        // 4. Re-fetch ALL data layers (including RLS-protected ones)
        fetchNsmData({ ...geoJsonParams, mode: modeRef.current, layer: nsmLayer, geoJsonRef: nsmGeoJsonRef });
        fetchRpasData({ ...geoJsonParams, mode: modeRef.current, layer: rpasLayer, geoJsonRef: rpasGeoJsonRef });
        fetchAllAipZones({ ...geoJsonParams, mode: modeRef.current, layer: aipLayer, aipLayer, rmzTmzAtzLayer, aipGeoJsonLayersRef });
        fetchObstacles({ layer: obstaclesLayer, mode: modeRef.current });
        fetchAirportsData({ layer: airportsLayer, mode: modeRef.current });
        fetchAndDisplayMissions({ missionsLayer, completedMissionsLayer, modeRef, onMissionClickRef });
        fetchAndDisplayPlannedMissionPublications({ layer: plannedPublishedLayer, modeRef, windowHours: plannedWindowHoursRef.current });
        fetchDroneTelemetry({ droneLayer, modeRef });
        fetchActiveAdvisories({ activeAdvisoryLayer, flightMarkersRef });
        fetchPilotPositions({ pilotPositionsLayer, flightMarkersRef, mode });
        fetchVerneomraader();
        
        // 5. Check realtime channel state and resubscribe if needed
        if ((mapChannel as any).state !== 'joined') {
          console.log('Map: realtime channel disconnected, resubscribing');
          mapChannel.subscribe();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(droneInterval);
      clearInterval(plannedInterval);
      plannedPublishedLayerRef.current = null;
      if (vernDebounceTimer) clearTimeout(vernDebounceTimer);
      if (kraftDebounceTimer) clearTimeout(kraftDebounceTimer);
      if (naisDebounceTimer) clearTimeout(naisDebounceTimer);
      
      map.off('moveend', debouncedFetchVern);
      map.off('moveend', debouncedFetchKraft);
      map.off('moveend', debouncedFetchNais);
      map.off('zoomend', updateVesselScale);
      populationDensityRendererRef.current = null;
      
      safeSkyManager.cleanup();
      map.off("click");
      mapChannel.unsubscribe();
      routePlanningInteractiveLayerRefs.current = [];
      leafletMapRef.current = null;
      try { map.stop(); } catch {}
      try { map.remove(); } catch {}
    };
  }, [profileLoaded, isTensioHierarchy, companyDefaultLayersLoaded]);

  // Recenter map when initialCenter changes — guard with tolerance so a parent
  // that mirrors moveend back into this prop does not snap the user back.
  useEffect(() => {
    if (!initialCenter || !leafletMapRef.current) return;
    const cur = leafletMapRef.current.getCenter();
    const dLat = Math.abs(cur.lat - initialCenter[0]);
    const dLng = Math.abs(cur.lng - initialCenter[1]);
    if (dLat < 1e-4 && dLng < 1e-4) return;
    leafletMapRef.current.setView(initialCenter, 13);
  }, [initialCenter]);

  // Render historical flight tracks (e.g. flown routes from a mission's flight_logs)
  const historicalTracksLayerRef = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    // Clear previous layer
    if (historicalTracksLayerRef.current) {
      try { historicalTracksLayerRef.current.remove(); } catch {}
      historicalTracksLayerRef.current = null;
    }

    const tracks = (historicalFlightTracks ?? []).filter(t => t?.positions && t.positions.length >= 2);
    if (!tracks.length) return;

    if (!map.getPane('historicalFlightPane')) {
      map.createPane('historicalFlightPane');
      const p = map.getPane('historicalFlightPane');
      if (p) { p.style.zIndex = '715'; p.style.pointerEvents = 'auto'; }
    }

    const layer = L.layerGroup().addTo(map);
    historicalTracksLayerRef.current = layer;

    const allPoints: [number, number][] = [];
    tracks.forEach((track, trackIndex) => {
      const latLngs = track.positions.map(p => [p.lat, p.lng] as [number, number]);
      const trackLine = L.polyline(latLngs, { color: '#22c55e', weight: 4, opacity: 0.9, pane: 'historicalFlightPane' }).addTo(layer);
      latLngs.forEach(ll => allPoints.push(ll));

      trackLine.on('click', (e: L.LeafletMouseEvent) => {
        const clickLatLng = e.latlng;
        let nearestIdx = 0;
        let minDist = Infinity;
        track.positions.forEach((pos, idx) => {
          const dist = clickLatLng.distanceTo(L.latLng(pos.lat, pos.lng));
          if (dist < minDist) { minDist = dist; nearestIdx = idx; }
        });
        const pos = track.positions[nearestIdx];
        const altitude = pos.alt_msl ?? pos.alt ?? null;
        const content = `<div style="font-size:12px;line-height:1.5">
          <strong>${track.flightDate ? t('pages.map.flightTrackPopup.flownRouteOn', { date: new Date(track.flightDate).toLocaleDateString(dateLocale) }) : t('pages.map.flightTrackPopup.flownRoute')}</strong><hr style="margin:4px 0"/>
          ${t('pages.map.flightTrackPopup.pointOf', { i: nearestIdx + 1, n: track.positions.length })}<br/>
          ${altitude != null ? `${t('pages.map.flightTrackPopup.altMsl', { v: Math.round(altitude) })}<br/>` : ''}
          ${pos.alt_agl != null ? `${t('pages.map.flightTrackPopup.altAgl', { v: Math.round(pos.alt_agl) })}<br/>` : ''}
          ${pos.speed != null ? `${t('pages.map.flightTrackPopup.speed', { v: pos.speed.toFixed(1) })}<br/>` : ''}
          ${pos.heading != null ? `${t('pages.map.flightTrackPopup.heading', { v: Math.round(pos.heading) })}<br/>` : ''}
          ${pos.timestamp ? t('pages.map.flightTrackPopup.time', { v: new Date(pos.timestamp).toLocaleTimeString(dateLocale) }) : ''}
        </div>`;
        L.popup().setLatLng([pos.lat, pos.lng]).setContent(content).openOn(map);
      });

      const startPos = track.positions[0];
      L.circleMarker([startPos.lat, startPos.lng], {
        radius: 8, fillColor: '#22c55e', color: '#fff', weight: 2, fillOpacity: 1, pane: 'historicalFlightPane',
      }).addTo(layer).bindPopup(t('pages.map.flightTrackPopup.flightStart', { i: trackIndex + 1 }));

      const endPos = track.positions[track.positions.length - 1];
      L.circleMarker([endPos.lat, endPos.lng], {
        radius: 8, fillColor: '#f97316', color: '#fff', weight: 2, fillOpacity: 1, pane: 'historicalFlightPane',
      }).addTo(layer).bindPopup(t('pages.map.flightTrackPopup.flightEnd', { i: trackIndex + 1 }));
    });

    // Fit bounds if no explicit initial center from route
    if (allPoints.length > 1 && !initialCenter) {
      try {
        map.fitBounds(L.latLngBounds(allPoints), { padding: [40, 40], maxZoom: 16 });
      } catch {}
    }

    return () => {
      if (historicalTracksLayerRef.current) {
        try { historicalTracksLayerRef.current.remove(); } catch {}
        historicalTracksLayerRef.current = null;
      }
    };
  }, [historicalFlightTracks, initialCenter, profileLoaded, companyDefaultLayersLoaded]);

  // Display existing route
  useEffect(() => {
    if (existingRoute && existingRoute.coordinates.length > 0) {
      routeHistoryRef.current = [];
      routePointsRef.current = [...existingRoute.coordinates];
      updateRouteDisplay();
    }
  }, [existingRoute, updateRouteDisplay]);

  // Auto-vis kartlag-features langs ruten (verneområder, CAA-soner, NVE-kraftledninger)
  // innenfor 500 m fra ruten – uavhengig av om laget er aktivert i lag-menyen.
  useEffect(() => {
    const map = leafletMapRef.current;
    const layer = routeProximityLayerRef.current;
    if (!map || !layer) return;

    if (routeProximityDebounceRef.current !== null) {
      window.clearTimeout(routeProximityDebounceRef.current);
      routeProximityDebounceRef.current = null;
    }

    const coords = routePointsRef.current;
    if (coords.length < 2) {
      try { layer.clearLayers(); } catch {}
      routeProximityAbortRef.current?.abort();
      routeProximityAbortRef.current = null;
      return;
    }

    routeProximityDebounceRef.current = window.setTimeout(() => {
      routeProximityAbortRef.current?.abort();
      const controller = new AbortController();
      routeProximityAbortRef.current = controller;
      updateRouteProximityLayers({
        map,
        layer,
        coordinates: [...coords],
        signal: controller.signal,
        cache: routeProximityCacheRef.current,
        activeManualLayers: {
          ais: !!(naisLayerRef.current && map.hasLayer(naisLayerRef.current)),
          obstacles: !!(obstaclesLayerRef.current && map.hasLayer(obstaclesLayerRef.current)),
        },
      })
        .then(() => {
          syncRoutePlanningInteractivity(modeRef.current, routeInspectModeRef.current);
        })
        .catch(() => { /* swallow */ });
    }, 300);

    return () => {
      if (routeProximityDebounceRef.current !== null) {
        window.clearTimeout(routeProximityDebounceRef.current);
        routeProximityDebounceRef.current = null;
      }
    };
  }, [routePointCount, routeUndoToken, controlledRoute, existingRoute]);

  // Cleanup proximity layer on unmount
  useEffect(() => {
    return () => {
      routeProximityAbortRef.current?.abort();
      routeProximityAbortRef.current = null;
      if (routeProximityDebounceRef.current !== null) {
        window.clearTimeout(routeProximityDebounceRef.current);
        routeProximityDebounceRef.current = null;
      }
      try { routeProximityLayerRef.current?.clearLayers(); } catch {}
      routeProximityLayerRef.current = null;
    };
  }, []);


  // Focus on specific flight
  useEffect(() => {
    if (!focusFlightId || !leafletMapRef.current) return;

    const timer = setTimeout(() => {
      const marker = flightMarkersRef.current.get(focusFlightId);
      if (marker) {
        const latlng = marker.getLatLng();
        leafletMapRef.current?.setView(latlng, 14, { animate: true });
        marker.openPopup();
      } else {
        supabase
          .from('active_flights')
          .select('start_lat, start_lng, publish_mode, route_data')
          .eq('id', focusFlightId)
          .maybeSingle()
          .then(({ data }) => {
            if (!data || !leafletMapRef.current) return;
            if (data.start_lat && data.start_lng) {
              leafletMapRef.current.setView([data.start_lat, data.start_lng], 14, { animate: true });
            } else if (data.route_data) {
              const rd = data.route_data as any;
              if (rd.coordinates?.length > 0) {
                const centLat = rd.coordinates.reduce((s: number, c: any) => s + c.lat, 0) / rd.coordinates.length;
                const centLng = rd.coordinates.reduce((s: number, c: any) => s + c.lng, 0) / rd.coordinates.length;
                leafletMapRef.current.setView([centLat, centLng], 13, { animate: true });
              }
            }
          });
      }
      onFocusFlightHandled?.();
    }, 300);

    return () => clearTimeout(timer);
  }, [focusFlightId, onFocusFlightHandled]);

  // Pilot position marker and VLOS circle
  useEffect(() => {
    if (!pilotLayerRef.current || !leafletMapRef.current) return;
    
    pilotLayerRef.current.clearLayers();
    pilotMarkerRef.current = null;
    pilotCircleRef.current = null;
    
    if (!pilotPosition) return;
    
    const VLOS_RADIUS = pilotVlosRadiusM && pilotVlosRadiusM > 0 ? Math.round(pilotVlosRadiusM) : 120;
    const alosLine = pilotAlosCalculation
      ? `<br/><span style="font-size: 12px;">${t('pages.map.pilotPopup.alos', { v: pilotAlosCalculation })}</span>`
      : `<br/><span style="font-size: 11px; color: #999;">${t('pages.map.pilotPopup.alosDefault')}</span>`;
    
    const pilotIcon = L.divIcon({
      className: '',
      html: `<div style="
        width: 36px; height: 36px; background: #8b5cf6;
        border: 3px solid white; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>
        </svg>
      </div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -18],
    });
    
    const marker = L.marker([pilotPosition.lat, pilotPosition.lng], { 
      icon: pilotIcon, draggable: mode === 'routePlanning', pane: 'routePane',
    });
    
    marker.bindPopup(`<div><strong>${t('pages.map.pilotPopup.title')}</strong><br/><span style="font-size: 11px; color: #666;">${t('pages.map.pilotPopup.dragToMove')}</span><br/><span style="font-size: 12px;">${t('pages.map.pilotPopup.vlosRadius', { r: VLOS_RADIUS })}</span>${alosLine}</div>`);
    
    if (mode === 'routePlanning') {
      marker.on('dragend', (e: any) => {
        const { lat, lng } = e.target.getLatLng();
        const cb = onPilotPositionChangeRef.current;
        if (cb) cb({ lat, lng });
      });
    }
    
    marker.addTo(pilotLayerRef.current);
    pilotMarkerRef.current = marker;
    
    const circle = L.circle([pilotPosition.lat, pilotPosition.lng], {
      radius: VLOS_RADIUS, color: '#8b5cf6', weight: 2, fillColor: '#8b5cf6',
      fillOpacity: 0.1, dashArray: '5, 5', pane: 'routePane',
    });
    circle.addTo(pilotLayerRef.current);
    pilotCircleRef.current = circle;
  }, [pilotPosition, mode, pilotVlosRadiusM, pilotAlosCalculation]);

  const handleLayerToggle = (id: string, enabled: boolean) => {
    const map = leafletMapRef.current;
    if (!map) return;
    
    if (id === 'safesky') {
      const controls = (map as any)._safeskyControls;
      if (controls) {
        if (enabled) controls.start();
        else controls.stop();
      }
    }

    // Helper: normalize layer-or-array → array of Leaflet layers
    const toArr = (l: L.Layer | L.Layer[]): L.Layer[] => (Array.isArray(l) ? l : [l]);

    // Kraftledninger: fetch data on enable, clear on disable
    // Befolkning: legg til riktig kilde (SSB i Norge, Eurostat ellers)
    if (id === 'befolkning') {
      const ctl = (map as any)._befolkningControls;
      setLayers((prevLayers) =>
        prevLayers.map((layer) => {
          if (layer.id === id) {
            if (enabled) ctl?.sync?.();
            else ctl?.removeAll?.();
            return { ...layer, enabled };
          }
          return layer;
        })
      );
      return;
    }

    if (id === 'kraftledninger') {
      setLayers((prevLayers) =>
        prevLayers.map((layer) => {
          if (layer.id === id) {
            const layers = toArr(layer.layer);
            if (enabled) {
              layers.forEach((l) => l.addTo(map));
              fetchKraftledningerInBounds({
                layer: layers[0] as L.LayerGroup,
                bounds: map.getBounds(),
                zoom: map.getZoom(),
                pane: 'powerPane',
                mode: modeRef.current,
              });
            } else {
              layers.forEach((l) => {
                if ('clearLayers' in l) (l as L.LayerGroup).clearLayers();
                l.remove();
              });
            }
            return { ...layer, enabled };
          }
          return layer;
        })
      );
      return;
    }

    // NAIS skipstrafikk: fetch data on enable, clear on disable
    if (id === 'nais') {
      setLayers((prevLayers) =>
        prevLayers.map((layer) => {
          if (layer.id === id) {
            const layers = toArr(layer.layer);
            if (enabled) {
              layers.forEach((l) => l.addTo(map));
              fetchAisVesselsInBounds({
                layer: layers[0] as L.LayerGroup,
                bounds: map.getBounds(),
                zoom: map.getZoom(),
                pane: 'naisPane',
                mode: modeRef.current,
              });
            } else {
              layers.forEach((l) => {
                if ('clearLayers' in l) (l as L.LayerGroup).clearLayers();
                l.remove();
              });
            }
            return { ...layer, enabled };
          }
          return layer;
        })
      );
      return;
    }
    
    setLayers((prevLayers) =>
      prevLayers.map((layer) => {
        if (layer.id === id) {
          const layers = toArr(layer.layer);
          if (enabled) layers.forEach((l) => l.addTo(map));
          else layers.forEach((l) => l.remove());
          return { ...layer, enabled };
        }
        return layer;
      })
    );
  };

  const clearRoute = useCallback(() => {
    if (routePointsRef.current.length > 0) pushRouteHistory();
    routePointsRef.current = [];
    setRoutePointCount(0);
    updateRouteDisplay();
    if (onRouteChange) onRouteChange({ coordinates: [], totalDistance: 0 });
  }, [updateRouteDisplay, onRouteChange, pushRouteHistory]);

  const undoLastPoint = useCallback(() => {
    if (routeHistoryRef.current.length === 0) return;
    const prev = routeHistoryRef.current.pop()!;
    routePointsRef.current = prev;
    setRoutePointCount(prev.length);
    updateRouteDisplay();
    if (onRouteChange) {
      const coords = [...prev];
      onRouteChange({ coordinates: coords, totalDistance: calculateTotalDistance(coords), areaKm2: calculatePolygonAreaKm2(coords) });
    }
  }, [updateRouteDisplay, onRouteChange]);

  useEffect(() => {
    if (routeUndoToken == null || routeUndoToken === lastRouteUndoTokenRef.current) return;
    lastRouteUndoTokenRef.current = routeUndoToken;
    undoLastPoint();
  }, [routeUndoToken, undoLastPoint]);

  return (
    <div className="relative w-full h-full overflow-hidden touch-manipulation select-none">
      <div ref={mapRef} data-tour="map-container" className="w-full h-full touch-manipulation" />
      
      <div className="absolute top-4 right-4 z-[1050] flex flex-col gap-2">
        <Button
          variant={weatherEnabled ? "default" : "secondary"}
          size="icon"
          className={`shadow-lg ${weatherEnabled ? "" : "bg-card hover:bg-accent"}`}
          onClick={() => { if (mode !== "view") return; setWeatherEnabled(!weatherEnabled); }}
          disabled={mode !== "view"}
          title={mode !== "view" ? t('pages.map.weatherToggle.unavailable') : weatherEnabled ? t('pages.map.weatherToggle.off') : t('pages.map.weatherToggle.on')}
        >
          <CloudSun className="h-5 w-5" />
        </Button>

        <Button
          variant="secondary"
          size="icon"
          className="shadow-lg bg-card hover:bg-accent"
          onClick={() => {
            const next: 'osm' | 'satellite' | 'topo' =
              baseLayerType === "osm" ? "satellite"
              : baseLayerType === "satellite" ? "topo"
              : "osm";
            switchBaseLayer(next);
          }}
          title={
            baseLayerType === "osm" ? t('pages.map.baseToggle.toSatellite')
            : baseLayerType === "satellite" ? t('pages.map.baseToggle.toTopo')
            : t('pages.map.baseToggle.toStandard')
          }
        >
          {baseLayerType === "osm" ? <Satellite className="h-5 w-5" />
            : baseLayerType === "satellite" ? <Mountain className="h-5 w-5" />
            : <MapIcon className="h-5 w-5" />}
        </Button>

        <MapLayerControl layers={layers} onLayerToggle={handleLayerToggle} />

        {stackSlotAboveLayers}

        {mode === "view" && onStartRoutePlanning && (
          <Button data-tour="map-route-planner-trigger" onClick={onStartRoutePlanning} variant="default" size="icon" className="shadow-lg" title={t('pages.map.planNewRoute')}>
            <Route className="h-5 w-5" />
          </Button>
        )}
      </div>

      {mode === "view" && weatherEnabled && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-background/95 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border border-border z-[1000] text-sm">
          <span className="text-muted-foreground">{t('pages.map.weatherToggle.hint')}</span>
        </div>
      )}

      {mode === "routePlanning" && routePointCount === 0 && (
        <div className={`absolute top-4 z-[1000] bg-background/95 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border border-border text-sm ${routeHintOffsetClass ?? "left-1/2 -translate-x-1/2"}`}>
          <span className="text-muted-foreground">{t('pages.map.weatherToggle.clickToAddPoints')}</span>
        </div>
      )}

      {layers.find(l => l.id === "arealbruk")?.enabled && <ArealbrukLegend />}
      {layers.find(l => l.id === "befolkning")?.enabled ? (
        <BefolkningLegend
          resolution="1km"
          source={befolkningSource}
        />
      ) : null}
      {layers.find(l => l.id === "tettsteder")?.enabled && <TettstederLegend />}
      {layers.find(l => l.id === "eiendomsgrenser")?.enabled && <EiendomsgrenserLegend />}
    </div>
  );
}
