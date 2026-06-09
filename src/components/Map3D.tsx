/**
 * Map3D — MapLibre 3D-kart med:
 *  - OSM / Satellitt / Topo base-toggle (speiler 2D-kartet)
 *  - AWS Terrarium DEM terreng + hillshade + pitch
 *  - Viewport-basert henting av CAA NO + DK dronesoner (sone-toggle)
 *  - Klikk-popup på soner
 */

import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl, { Map as MlMap, StyleSpecification, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Button } from "@/components/ui/button";
import { Satellite, Mountain, Map as MapIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getBeaconSvgUrl } from "@/lib/mapIcons";
import { renderTrafficPopup } from "@/lib/mapTrafficPopup";
import {
  buildCaaZonePopupHtml,
  buildDkZonePopupHtml,
  defaultUpperLimitM,
  zoneSource,
} from "@/lib/zonePopups";
import {
  AIP_ZONE_STYLES,
  AIP_ZONE_TYPES,
  buildAipZonePopupHtml,
  parseAipLimitToMeters,
} from "@/lib/aipPopups";
import { createSafeSkyModelLayer, SafeSkyModelLayer, SafeSkyBeacon } from "@/lib/safeskyModelLayer";
import { sampleZonesTerrain, zoneCacheKey } from "@/lib/zoneTerrainSampler";
import { fetchTerrainElevations } from "@/lib/terrainElevation";
import { buildSoraZoneGeoJSON, type SoraSettings } from "@/lib/soraGeometry";
import type { RouteData, RoutePoint } from "@/types/map";
import { calculateTotalDistance, calculatePolygonAreaKm2 } from "@/lib/mapGeometry";

const SAFESKY_MODEL_URL = "/models/dji_matrice_t300/scene.gltf";

interface Map3DProps {
  initialCenter?: [number, number];
  initialZoom?: number;
  onMissionClick?: (mission: any) => void;
  onViewChange?: (center: [number, number], zoom: number) => void;
  /** Ekstra knapp/element som rendres rett under base-layer-knappen i høyre stack. */
  extraStackSlot?: React.ReactNode;
  /** Aktiv modus — "routePlanning" aktiverer klikk-til-rutepunkt og SORA-buffer. */
  mode?: "view" | "routePlanning";
  /** Eksisterende rute som skal lastes inn ved oppstart (f.eks. ved mission-edit). */
  existingRoute?: RouteData;
  /** Kontrollert rute fra parent — synces inn ved endring (KML-import, undo, clear). */
  controlledRoute?: RouteData;
  /** Kalles ved hver endring av ruten (klikk, drag, slett). */
  onRouteChange?: (route: RouteData) => void;
  /** SORA-innstillinger fra parent — driver 3D-buffer-extrusion. */
  soraSettings?: SoraSettings;
}

type BaseLayer = "osm" | "satellite" | "topo";

const TERRAIN_SOURCE = {
  type: "raster-dem" as const,
  tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
  tileSize: 256,
  encoding: "terrarium" as const,
  maxzoom: 14,
  attribution: "© Mapzen / AWS Terrain Tiles",
};

// Farger pr. layer_id — matcher 2D-kartet
const ZONE_COLORS: Record<string, string> = {
  // CAA NO
  fengsler: "#b91c1c",
  ambassader: "#b91c1c",
  fareomrader: "#eab308",
  flyplasser: "#dc2626",
  notam_soner: "#eab308",
  restriksjoner: "#dc2626",
  // DK
  rod: "#dc2626",
  orange: "#f59e0b",
  bla: "#2563eb",
};

const CAA_LAYER_IDS = ["fengsler", "ambassader", "fareomrader", "flyplasser", "notam_soner", "restriksjoner"];
const DK_LAYER_IDS = ["rod", "orange", "bla"];

function buildStyle(base: BaseLayer): StyleSpecification {
  const baseSource =
    base === "osm"
      ? {
          type: "raster" as const,
          tiles: [
            "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
            "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
            "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors",
        }
      : base === "satellite"
      ? {
          type: "raster" as const,
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          attribution: "© Esri World Imagery",
        }
      : {
          type: "raster" as const,
          tiles: [
            "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
            "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
            "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
          maxzoom: 17,
          attribution: "© OpenTopoMap (CC-BY-SA)",
        };

  return {
    version: 8,
    sources: {
      base: baseSource,
      terrainSource: TERRAIN_SOURCE,
      hillshadeSource: TERRAIN_SOURCE,
      // OpenFreeMap (free, no API key) — gir bl.a. building-layer for 3D-bygninger
      openmaptiles: {
        type: "vector" as const,
        url: "https://tiles.openfreemap.org/planet",
      },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#cfe2f3" } },
      { id: "base", type: "raster", source: "base" },
      {
        id: "hillshade",
        type: "hillshade",
        source: "hillshadeSource",
        paint: { "hillshade-exaggeration": 0.4 },
      },
      {
        id: "3d-buildings",
        type: "fill-extrusion",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 14,
        paint: {
          "fill-extrusion-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "render_height"], ["get", "height"], 8],
            0, "#d6d6d6",
            50, "#b8b8b8",
            150, "#9a9a9a",
            300, "#7c7c7c",
          ],
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], ["get", "height"], 8],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], ["get", "min_height"], 0],
          "fill-extrusion-opacity": 0.85,
        },
      },
    ],
    terrain: { source: "terrainSource", exaggeration: 1.3 },
  };
}

function colorExpression(): any {
  // ['match', ['get','layer_id'], 'rod','#dc2626', ..., '#888']
  const expr: any[] = ["match", ["get", "layer_id"]];
  Object.entries(ZONE_COLORS).forEach(([k, v]) => {
    expr.push(k, v);
  });
  expr.push("#888888");
  return expr;
}

function addZoneLayers(map: MlMap, extrude: boolean) {
  if (map.getSource("zones")) return;
  map.addSource("zones", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  // Ground outline — alltid synlig så sonene gjenkjennes rett ovenfra og når man zoomer ut.
  map.addLayer({
    id: "zones-outline",
    type: "line",
    source: "zones",
    filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]],
    paint: {
      "line-color": colorExpression(),
      "line-width": 1.5,
    },
  });

  if (extrude) {
    map.addLayer({
      id: "zones-extrusion",
      type: "fill-extrusion",
      source: "zones",
      filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]],
      paint: {
        "fill-extrusion-color": colorExpression(),
        // base: lower_limit_m → terrain_min_m → 0
        "fill-extrusion-base": [
          "case",
          ["!=", ["get", "lower_limit_m"], null], ["get", "lower_limit_m"],
          ["!=", ["get", "terrain_min_m"], null], ["get", "terrain_min_m"],
          0,
        ],
        // height: upper_limit_m (MSL) → terrain_max_m + 120 → 120 (nød-fallback)
        "fill-extrusion-height": [
          "case",
          ["!=", ["get", "upper_limit_m"], null], ["get", "upper_limit_m"],
          ["!=", ["get", "terrain_max_m"], null], ["+", ["get", "terrain_max_m"], 120],
          120,
        ],
        "fill-extrusion-opacity": 0.35,
      },
    });
  } else {
    map.addLayer({
      id: "zones-fill",
      type: "fill",
      source: "zones",
      filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]],
      paint: {
        "fill-color": colorExpression(),
        "fill-opacity": 0.18,
      },
    });
  }

  map.addLayer({
    id: "zones-point",
    type: "circle",
    source: "zones",
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": 5,
      "circle-color": colorExpression(),
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#ffffff",
    },
  });
}

// ---- OpenAIP luftrom (CTR, TIZ, P, R, D, RMZ, TMZ) ----
function aipColorExpression(): any {
  const expr: any[] = ["match", ["get", "zone_type"]];
  Object.entries(AIP_ZONE_STYLES).forEach(([k, v]) => {
    expr.push(k, v.color);
  });
  expr.push("#888888");
  return expr;
}

function aipOpacityExpression(base: number): any {
  const expr: any[] = ["match", ["get", "zone_type"]];
  Object.entries(AIP_ZONE_STYLES).forEach(([k, v]) => {
    expr.push(k, v.fillOpacity * base);
  });
  expr.push(0.15 * base);
  return expr;
}

function addAipLayers(map: MlMap, extrude: boolean) {
  if (map.getSource("aip")) return;
  map.addSource("aip", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  map.addLayer({
    id: "aip-outline",
    type: "line",
    source: "aip",
    paint: {
      "line-color": aipColorExpression(),
      "line-width": 1.5,
      "line-opacity": 0.8,
    },
  });

  if (extrude) {
    map.addLayer({
      id: "aip-extrusion",
      type: "fill-extrusion",
      source: "aip",
      paint: {
        "fill-extrusion-color": aipColorExpression(),
        // base: lower_limit_m → terrain_min_m → 0
        "fill-extrusion-base": [
          "case",
          ["!=", ["get", "lower_limit_m"], null], ["get", "lower_limit_m"],
          ["!=", ["get", "terrain_min_m"], null], ["get", "terrain_min_m"],
          0,
        ],
        // height: upper_limit_m (MSL) → terrain_max_m + 120 → 120 (nød-fallback)
        "fill-extrusion-height": [
          "case",
          ["!=", ["get", "upper_limit_m"], null], ["get", "upper_limit_m"],
          ["!=", ["get", "terrain_max_m"], null], ["+", ["get", "terrain_max_m"], 120],
          120,
        ],
        "fill-extrusion-opacity": 0.4, // MapLibre tillater ikke data-uttrykk her
      },
    });
  } else {
    map.addLayer({
      id: "aip-fill",
      type: "fill",
      source: "aip",
      paint: {
        "fill-color": aipColorExpression(),
        "fill-opacity": aipOpacityExpression(1),
      },
    });
  }
}

/**
 * Beriker GeoJSON-features med terrain_min_m / terrain_max_m (MSL) for polygon-soner.
 * Muterer feature.properties in-place. Returnerer true hvis minst én feature ble oppdatert
 * (kaller bør da re-sette GeoJSON-source).
 */
async function enrichFeaturesWithTerrain(features: any[]): Promise<boolean> {
  const polys = features.filter(
    (f) =>
      f?.geometry?.type === "Polygon" || f?.geometry?.type === "MultiPolygon"
  );
  if (polys.length === 0) return false;
  const items = polys.map((f) => ({
    key: zoneCacheKey(f.properties, f.geometry),
    geometry: f.geometry,
    feature: f,
  }));
  const samples = await sampleZonesTerrain(
    items.map((i) => ({ key: i.key, geometry: i.geometry }))
  );
  let changed = false;
  for (const it of items) {
    const s = samples.get(it.key);
    if (!s) continue;
    if (
      it.feature.properties.terrain_min_m !== s.min ||
      it.feature.properties.terrain_max_m !== s.max
    ) {
      it.feature.properties.terrain_min_m = s.min;
      it.feature.properties.terrain_max_m = s.max;
      changed = true;
    }
  }
  return changed;
}




export default function Map3D({
  initialCenter,
  initialZoom = 12,
  onViewChange,
  extraStackSlot,
  mode = "view",
  existingRoute,
  controlledRoute,
  onRouteChange,
  soraSettings,
}: Map3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const fetchTimerRef = useRef<number | null>(null);
  const [base, setBase] = useState<BaseLayer>("satellite");
  // Soner, luftrom og lufttrafikk er alltid på (egne toggle-knapper er fjernet for å rydde i UI)
  const zonesEnabled = true;
  const aipEnabled = true;
  const trafficEnabled = true;
  const [extrude, setExtrude] = useState(true);
  const extrudeRef = useRef(extrude);
  extrudeRef.current = extrude;
  const aipFetchedRef = useRef(false);
  const aipFeaturesRef = useRef<any[]>([]);
  const trafficEnabledRef = useRef(trafficEnabled);
  trafficEnabledRef.current = trafficEnabled;
  const safeskyIconsLoadedRef = useRef<Set<string>>(new Set());
  const safeskyPollRef = useRef<number | null>(null);
  const safeskyModelLayerRef = useRef<SafeSkyModelLayer | null>(null);
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;

  // ===== Route planning state =====
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const onRouteChangeRef = useRef(onRouteChange);
  onRouteChangeRef.current = onRouteChange;
  const soraSettingsRef = useRef<SoraSettings | undefined>(soraSettings);
  soraSettingsRef.current = soraSettings;
  const routePointsRef = useRef<RoutePoint[]>([]);
  const routeMarkersRef = useRef<maplibregl.Marker[]>([]);
  const lastEmittedRouteJsonRef = useRef<string>("");
  const soraTerrainDebounceRef = useRef<number | null>(null);

  // Hent og oppdater dronesoner basert på viewport
  const refreshZones = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("zones") as GeoJSONSource | undefined;
    if (!src) return;

    if (!zonesEnabled) {
      src.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const z = map.getZoom();
    if (z < 7) {
      src.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const b = map.getBounds();
    const bounds = {
      min_lat: b.getSouth(),
      min_lng: b.getWest(),
      max_lat: b.getNorth(),
      max_lng: b.getEast(),
    };

    try {
      const [caaRes, dkRes] = await Promise.all([
        z >= 9
          ? supabase.rpc("get_caa_zones_in_bounds", { ...bounds, p_layer_ids: CAA_LAYER_IDS })
          : Promise.resolve({ data: [] as any[], error: null }),
        supabase.rpc("get_dk_drone_zones_in_bounds", { ...bounds, p_layer_ids: DK_LAYER_IDS }),
      ]);

      const features: any[] = [];
      const pushRows = (rows: any[] | null) => {
        (rows || []).forEach((row) => {
          if (!row?.geometry) return;
          features.push({
            type: "Feature",
            geometry: row.geometry,
            properties: {
              // Felles
              layer_id: row.layer_id,
              name: row.name ?? "",
              restriction: row.restriction ?? "",
              lower_limit_m: row.lower_limit_m ?? null,
              upper_limit_m: row.upper_limit_m ?? null,
              upper_ref: row.upper_ref ?? null,
              // CAA-spesifikt
              message: row.message ?? null,
              authority_name: row.authority_name ?? null,
              authority_url: row.authority_url ?? null,
              authority_phone: row.authority_phone ?? null,
              // DK-spesifikt
              icao: row.icao ?? null,
              category: row.category ?? null,
              buffer: row.buffer ?? null,
              // Default-høyde for 3D-sylinder når upper_limit_m mangler
              fallback_upper_m: defaultUpperLimitM(row.layer_id),
            },
          });
        });
      };
      pushRows(caaRes.data as any[]);
      pushRows(dkRes.data as any[]);

      src.setData({ type: "FeatureCollection", features });

      // Berik polygon-soner med terrenghøyde (min/max MSL) for korrekt 3D-base + fallback-topp.
      void enrichFeaturesWithTerrain(features).then((changed) => {
        if (changed) src.setData({ type: "FeatureCollection", features });
      });
    } catch (err) {
      console.error("[Map3D] zone fetch failed", err);
    }
  }, [zonesEnabled]);

  // Hent AIP-luftrom (én gang, globalt — samme strategi som 2D)
  const applyAipData = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("aip") as GeoJSONSource | undefined;
    if (!src) return;
    const features = aipEnabled ? aipFeaturesRef.current : [];
    src.setData({ type: "FeatureCollection", features });
    if (aipEnabled && features.length > 0) {
      void enrichFeaturesWithTerrain(features).then((changed) => {
        if (changed) src.setData({ type: "FeatureCollection", features });
      });
    }
  }, [aipEnabled]);

  const fetchAip = useCallback(async () => {
    if (aipFetchedRef.current) return;
    aipFetchedRef.current = true;
    try {
      const { data, error } = await supabase
        .from("aip_restriction_zones")
        .select("zone_id, zone_type, name, upper_limit, lower_limit, remarks, geometry")
        .in("zone_type", AIP_ZONE_TYPES)
        .eq("is_official", true);
      if (error || !data) {
        if (error) console.error("[Map3D] aip fetch error", error);
        aipFetchedRef.current = false;
        return;
      }
      const features: any[] = [];
      data.forEach((z: any) => {
        if (!z?.geometry) return;
        features.push({
          type: "Feature",
          geometry: z.geometry,
          properties: {
            zone_id: z.zone_id,
            zone_type: z.zone_type,
            name: z.name ?? "",
            upper_limit: z.upper_limit ?? null,
            lower_limit: z.lower_limit ?? null,
            remarks: z.remarks ?? null,
            lower_limit_m: parseAipLimitToMeters(z.lower_limit),
            upper_limit_m: parseAipLimitToMeters(z.upper_limit),
          },
        });
      });
      aipFeaturesRef.current = features;
      applyAipData();
    } catch (err) {
      console.error("[Map3D] aip fetch failed", err);
      aipFetchedRef.current = false;
    }
  }, [applyAipData]);

  // Popup-click handler (felles for soner og AIP-luftrom)
  const installClickHandlers = useCallback((map: MlMap) => {
    const showZonePopup = (e: maplibregl.MapMouseEvent & { features?: any[] }) => {
      const f = e.features?.[0];
      if (!f) return;
      const p: any = f.properties || {};
      const src = zoneSource(p.layer_id);
      const html =
        src === "dk"
          ? buildDkZonePopupHtml(p)
          : buildCaaZonePopupHtml(p);
      new maplibregl.Popup({ closeButton: true, maxWidth: "320px" })
        .setLngLat(e.lngLat)
        .setHTML(`<div style="min-width:200px;max-width:300px;font-size:13px;line-height:1.4;">${html}</div>`)
        .addTo(map);
    };
    const showAipPopup = (e: maplibregl.MapMouseEvent & { features?: any[] }) => {
      const f = e.features?.[0];
      if (!f) return;
      const html = buildAipZonePopupHtml(f.properties || {});
      new maplibregl.Popup({ closeButton: true, maxWidth: "320px" })
        .setLngLat(e.lngLat)
        .setHTML(`<div style="min-width:200px;max-width:300px;font-size:13px;line-height:1.4;">${html}</div>`)
        .addTo(map);
    };
    const setCursor = (cursor: string) => () => {
      map.getCanvas().style.cursor = cursor;
    };
    ["zones-fill", "zones-extrusion", "zones-point"].forEach((layerId) => {
      map.on("click", layerId, showZonePopup);
      map.on("mouseenter", layerId, setCursor("pointer"));
      map.on("mouseleave", layerId, setCursor(""));
    });
    ["aip-fill", "aip-extrusion"].forEach((layerId) => {
      map.on("click", layerId, showAipPopup);
      map.on("mouseenter", layerId, setCursor("pointer"));
      map.on("mouseleave", layerId, setCursor(""));
    });
    const showTrafficPopup = (e: maplibregl.MapMouseEvent & { features?: any[] }) => {
      const f = e.features?.[0];
      if (!f) return;
      const p: any = f.properties || {};
      const html = renderTrafficPopup({
        callsign: p.callsign,
        beaconType: p.beacon_type,
        aircraftModel: p.aircraft_model,
        registration: p.registration,
        altitudeM: p.altitude,
        groundSpeedMs: p.ground_speed,
        verticalSpeedMs: p.vertical_speed,
        courseDeg: p.course,
        squawk: p.squawk,
        onGround: p.on_ground === true || p.on_ground === "true",
        updatedAt: p.last_update || p.updated_at,
        source: { kind: "safesky", subSource: p.source },
      });
      new maplibregl.Popup({ closeButton: true, maxWidth: "320px" })
        .setLngLat(e.lngLat)
        .setHTML(`<div style="min-width:200px;max-width:300px;font-size:13px;line-height:1.4;">${html}</div>`)
        .addTo(map);
    };
    map.on("click", "safesky-beacons", showTrafficPopup);
    map.on("mouseenter", "safesky-beacons", setCursor("pointer"));
    map.on("mouseleave", "safesky-beacons", setCursor(""));
  }, []);

  // ---- SafeSky-trafikk ----
  const ensureSafeSkyIcon = useCallback(async (map: MlMap, beaconType: string): Promise<string> => {
    const iconId = `safesky-${beaconType}`;
    if (safeskyIconsLoadedRef.current.has(iconId)) return iconId;
    if (map.hasImage(iconId)) {
      safeskyIconsLoadedRef.current.add(iconId);
      return iconId;
    }
    try {
      const url = getBeaconSvgUrl(beaconType);
      // Bruk fetch + createImageBitmap så SVG-er uten intrinsic størrelse også
      // tegnes riktig (Image.naturalWidth = 0 for slike SVG-er → drawImage tegner ingenting).
      const res = await fetch(url);
      if (!res.ok) throw new Error(`icon fetch ${res.status}`);
      const blob = await res.blob();
      let bitmap: ImageBitmap | null = null;
      try {
        bitmap = await createImageBitmap(blob, { resizeWidth: 64, resizeHeight: 64, resizeQuality: "high" } as any);
      } catch {
        // Fallback uten resize-options for eldre Safari
        bitmap = await createImageBitmap(blob);
      }
      if (!bitmap) return iconId;
      if (!map.hasImage(iconId)) {
        map.addImage(iconId, bitmap as any, { pixelRatio: 2 });
      }
      safeskyIconsLoadedRef.current.add(iconId);
    } catch (err) {
      console.warn("[Map3D] kunne ikke laste SafeSky-ikon", beaconType, err);
    }
    return iconId;
  }, []);

  const addSafeSkyLayer = useCallback((map: MlMap) => {
    if (!map.getSource("safesky")) {
      map.addSource("safesky", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }
    // Synlig circle-lag — fungerer som fallback hvis 3D-modellen ikke er lastet ennå,
    // og som klikk-mål for popup. Tydelig gul prikk med hvit kant så trafikk alltid vises.
    if (!map.getLayer("safesky-beacons")) {
      map.addLayer({
        id: "safesky-beacons",
        type: "circle",
        source: "safesky",
        paint: {
          "circle-radius": 7,
          "circle-color": "#fbbf24",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.95,
        },
      });
    }
    // Ekte 3D-modeller (Matrice) — custom three.js-lag oppå.
    if (!map.getLayer("safesky-3d-models")) {
      const modelLayer = createSafeSkyModelLayer(SAFESKY_MODEL_URL);
      safeskyModelLayerRef.current = modelLayer;
      try {
        map.addLayer(modelLayer as any);
      } catch (err) {
        console.error("[Map3D] addLayer safesky-3d-models failed", err);
      }
    }
  }, []);

  const refreshSafeSky = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("safesky") as GeoJSONSource | undefined;
    if (!src) return;
    if (!trafficEnabledRef.current) {
      src.setData({ type: "FeatureCollection", features: [] });
      safeskyModelLayerRef.current?.setBeacons([]);
      return;
    }
    try {
      const { data, error } = await supabase.from("safesky_beacons").select("*");
      if (error || !data) return;

      const rows = (data as any[]).filter((b) => b.latitude != null && b.longitude != null);

      const features = rows.map((b) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [Number(b.longitude), Number(b.latitude), Number(b.altitude) || 0],
        },
        properties: {
          beacon_type: b.beacon_type || "UNKNOWN",
          callsign: b.callsign ?? null,
          aircraft_model: b.aircraft_model ?? null,
          registration: b.registration ?? null,
          altitude: b.altitude ?? null,
          course: b.course ?? 0,
          ground_speed: b.ground_speed ?? null,
          vertical_speed: b.vertical_speed ?? null,
          squawk: b.squawk ?? null,
          on_ground: b.on_ground ?? null,
          source: b.source ?? null,
          last_update: b.last_update ?? null,
        },
      }));
      src.setData({ type: "FeatureCollection", features });

      // Push til 3D-modelllaget (Matrice GLTF)
      const beacons: SafeSkyBeacon[] = rows.map((b, i) => ({
        id: String(b.id ?? `${b.callsign ?? "x"}-${b.longitude}-${b.latitude}-${i}`),
        lng: Number(b.longitude),
        lat: Number(b.latitude),
        // Løft lave/0-altitude beacons litt over bakken så de ikke skjules av terreng/bygg
        altitude: Math.max(Number(b.altitude) || 0, 60),
        course: Number(b.course) || 0,
      }));
      console.info(`[Map3D] SafeSky: ${beacons.length} beacons → 3D-lag (modell-lastet: ${!!safeskyModelLayerRef.current})`);
      safeskyModelLayerRef.current?.setBeacons(beacons);
    } catch (err) {
      console.error("[Map3D] safesky fetch failed", err);
    }
  }, []);


  // Init map
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let map: MlMap | null = null;
    try {
      map = new maplibregl.Map({
        container: el,
        style: buildStyle("satellite"),
        center: initialCenter ? [initialCenter[1], initialCenter[0]] : [10.7522, 59.9139],
        zoom: initialZoom,
        pitch: 60,
        bearing: -20,
        maxPitch: 85,
      });
      mapRef.current = map;
    } catch (err) {
      console.error("[Map3D] init failed", err);
      return;
    }

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

    map.on("load", () => {
      addZoneLayers(map!, extrudeRef.current);
      addAipLayers(map!, extrudeRef.current);
      addSafeSkyLayer(map!);
      installClickHandlers(map!);
      refreshZones();
      fetchAip();
      refreshSafeSky();
    });

    const debouncedRefresh = () => {
      if (fetchTimerRef.current) window.clearTimeout(fetchTimerRef.current);
      fetchTimerRef.current = window.setTimeout(() => refreshZones(), 300);
    };
    map.on("moveend", debouncedRefresh);

    // Emit viewport-endringer til parent (Kart) så 2D/3D holdes synkronisert.
    const emitView = () => {
      try {
        const c = map!.getCenter();
        onViewChangeRef.current?.([c.lat, c.lng], map!.getZoom());
      } catch {}
    };
    map.on("moveend", emitView);
    map.on("zoomend", emitView);

    // Lazy-load ikon når MapLibre prøver å rendre en symbol med ukjent icon-image.
    map.on("styleimagemissing", (e: any) => {
      const id: string = e?.id || "";
      if (!id.startsWith("safesky-")) return;
      const beaconType = id.slice("safesky-".length) || "UNKNOWN";
      ensureSafeSkyIcon(map!, beaconType).then(() => {
        // Trigger re-render
        const src = map!.getSource("safesky") as GeoJSONSource | undefined;
        if (src) {
          try { (src as any)._data && src.setData((src as any)._data); } catch {}
        }
      });
    });

    // SafeSky-polling (10s) — samme intervall som 2D
    safeskyPollRef.current = window.setInterval(() => {
      if (trafficEnabledRef.current) refreshSafeSky();
    }, 10000);

    const t = window.setTimeout(() => { try { map!.resize(); } catch {} }, 300);

    return () => {
      window.clearTimeout(t);
      if (fetchTimerRef.current) window.clearTimeout(fetchTimerRef.current);
      if (safeskyPollRef.current) window.clearInterval(safeskyPollRef.current);
      if (soraTerrainDebounceRef.current) window.clearTimeout(soraTerrainDebounceRef.current);
      safeskyModelLayerRef.current?.destroy();
      safeskyModelLayerRef.current = null;
      routeMarkersRef.current.forEach((m) => { try { m.remove(); } catch {} });
      routeMarkersRef.current = [];
      try { map?.remove(); } catch {}
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bytt grunnkart uten å bygge kartet på nytt — gjenoppretter sone- og AIP-lagene
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      // setStyle fjerner alle lag inkl. vårt custom 3D-modellslag
      safeskyModelLayerRef.current?.destroy();
      safeskyModelLayerRef.current = null;
      map.setStyle(buildStyle(base));
      map.once("idle", () => {
        addZoneLayers(map, extrudeRef.current);
        addAipLayers(map, extrudeRef.current);
        addSafeSkyLayer(map);
        installClickHandlers(map);
        safeskyIconsLoadedRef.current.clear();
        refreshZones();
        applyAipData();
        refreshSafeSky();
      });
    } catch (err) {
      console.error("[Map3D] setStyle failed", err);
    }
  }, [base, refreshZones, installClickHandlers, applyAipData, addSafeSkyLayer, refreshSafeSky]);

  // Toggle 3D-sylindere vs flat fill — fjern og legg til lag på nytt
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    try {
      [
        "zones-fill", "zones-extrusion", "zones-outline", "zones-point",
        "aip-fill", "aip-extrusion", "aip-outline",
        "safesky-3d-models",
        "safesky-beacons",
      ].forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      safeskyModelLayerRef.current?.destroy();
      safeskyModelLayerRef.current = null;
      if (map.getSource("zones")) map.removeSource("zones");
      if (map.getSource("aip")) map.removeSource("aip");
      if (map.getSource("safesky")) map.removeSource("safesky");
      addZoneLayers(map, extrude);
      addAipLayers(map, extrude);
      addSafeSkyLayer(map);
      installClickHandlers(map);
      refreshZones();
      applyAipData();
      refreshSafeSky();
    } catch (err) {
      console.error("[Map3D] toggle extrude failed", err);
    }
  }, [extrude, installClickHandlers, refreshZones, applyAipData, addSafeSkyLayer, refreshSafeSky]);

  // Toggle zones (data)
  useEffect(() => {
    refreshZones();
  }, [zonesEnabled, refreshZones]);

  // Toggle AIP-luftrom (data)
  useEffect(() => {
    applyAipData();
  }, [aipEnabled, applyAipData]);

  // Toggle lufttrafikk (data)
  useEffect(() => {
    refreshSafeSky();
  }, [trafficEnabled, refreshSafeSky]);

  // ===================================================================
  // ROUTE PLANNING (3D) — speiler 2D-kartet, men bruker MapLibre.
  //   • Faste layer/source-IDs så cleanup/style-swap er trygt.
  //   • Tegner GeoJSON-rute + SORA-extrusion via flate fill-extrusion-lag.
  //   • Sender hver endring videre via onRouteChange — ingen save-logikk her.
  // ===================================================================
  const RP_SOURCE_ROUTE = "rp-route-src";
  const RP_SOURCE_ROUTE_RIBBON = "rp-route-ribbon-src";
  const RP_SOURCE_FG = "rp-sora-fg-src";
  const RP_SOURCE_CONT = "rp-sora-contingency-src";
  const RP_SOURCE_GRB = "rp-sora-grb-src";
  const RP_LAYER_ROUTE_LINE = "rp-route-line";
  const RP_LAYER_ROUTE_RIBBON = "rp-route-ribbon";
  const RP_LAYER_FG_FILL = "rp-sora-fg-fill";
  const RP_LAYER_FG_OUTLINE = "rp-sora-fg-outline";
  const RP_LAYER_CONT_FILL = "rp-sora-contingency-fill";
  const RP_LAYER_CONT_OUTLINE = "rp-sora-contingency-outline";
  const RP_LAYER_GRB_FILL = "rp-sora-grb-fill";

  const removeRoutePlanningLayers = useCallback((map: MlMap) => {
    [
      RP_LAYER_ROUTE_LINE,
      RP_LAYER_ROUTE_RIBBON,
      RP_LAYER_GRB_FILL,
      RP_LAYER_CONT_OUTLINE,
      RP_LAYER_CONT_FILL,
      RP_LAYER_FG_OUTLINE,
      RP_LAYER_FG_FILL,
    ].forEach((id) => {
      if (map.getLayer(id)) {
        try { map.removeLayer(id); } catch {}
      }
    });
    [RP_SOURCE_ROUTE, RP_SOURCE_ROUTE_RIBBON, RP_SOURCE_GRB, RP_SOURCE_CONT, RP_SOURCE_FG].forEach((id) => {
      if (map.getSource(id)) {
        try { map.removeSource(id); } catch {}
      }
    });
  }, []);

  const addRoutePlanningLayers = useCallback((map: MlMap) => {
    // Tomme sources — fylles via setData ved første rebuild.
    const emptyFC = { type: "FeatureCollection" as const, features: [] };
    if (!map.getSource(RP_SOURCE_FG)) map.addSource(RP_SOURCE_FG, { type: "geojson", data: emptyFC });
    if (!map.getSource(RP_SOURCE_CONT)) map.addSource(RP_SOURCE_CONT, { type: "geojson", data: emptyFC });
    if (!map.getSource(RP_SOURCE_GRB)) map.addSource(RP_SOURCE_GRB, { type: "geojson", data: emptyFC });
    if (!map.getSource(RP_SOURCE_ROUTE)) map.addSource(RP_SOURCE_ROUTE, { type: "geojson", data: emptyFC });
    if (!map.getSource(RP_SOURCE_ROUTE_RIBBON)) map.addSource(RP_SOURCE_ROUTE_RIBBON, { type: "geojson", data: emptyFC });

    // Per-lag høyde-uttrykk basert på render_base_m / render_height_m
    // (settes per feature i rebuildRouteSources).
    const baseExpr: any = ["coalesce", ["get", "render_base_m"], 0];
    const heightExprFG: any = ["coalesce", ["get", "render_height_m"], 120];
    const heightExprCont: any = ["coalesce", ["get", "render_height_m"], 60];
    const heightExprRibbon: any = ["coalesce", ["get", "render_height_m"], 120];

    // GRB: flatt fill-lag draperes automatisk på terreng.
    if (!map.getLayer(RP_LAYER_GRB_FILL)) {
      map.addLayer({
        id: RP_LAYER_GRB_FILL,
        type: "fill",
        source: RP_SOURCE_GRB,
        paint: {
          "fill-color": "#ef4444",
          "fill-opacity": 0.35,
          "fill-outline-color": "#b91c1c",
        },
      });
    }
    if (!map.getLayer(RP_LAYER_CONT_FILL)) {
      map.addLayer({
        id: RP_LAYER_CONT_FILL,
        type: "fill-extrusion",
        source: RP_SOURCE_CONT,
        paint: {
          "fill-extrusion-color": "#eab308",
          "fill-extrusion-opacity": 0.40,
          "fill-extrusion-base": baseExpr,
          "fill-extrusion-height": heightExprCont,
        },
      });
    }
    if (!map.getLayer(RP_LAYER_CONT_OUTLINE)) {
      map.addLayer({
        id: RP_LAYER_CONT_OUTLINE,
        type: "line",
        source: RP_SOURCE_CONT,
        paint: {
          "line-color": "#a16207",
          "line-width": 1.5,
          "line-opacity": 0.7,
        },
      });
    }
    if (!map.getLayer(RP_LAYER_FG_FILL)) {
      map.addLayer({
        id: RP_LAYER_FG_FILL,
        type: "fill-extrusion",
        source: RP_SOURCE_FG,
        paint: {
          "fill-extrusion-color": "#22c55e",
          "fill-extrusion-opacity": 0.45,
          "fill-extrusion-base": baseExpr,
          "fill-extrusion-height": heightExprFG,
        },
      });
    }
    if (!map.getLayer(RP_LAYER_FG_OUTLINE)) {
      map.addLayer({
        id: RP_LAYER_FG_OUTLINE,
        type: "line",
        source: RP_SOURCE_FG,
        paint: {
          "line-color": "#15803d",
          "line-width": 1.5,
          "line-opacity": 0.7,
        },
      });
    }
    if (!map.getLayer(RP_LAYER_ROUTE_RIBBON)) {
      map.addLayer({
        id: RP_LAYER_ROUTE_RIBBON,
        type: "fill-extrusion",
        source: RP_SOURCE_ROUTE_RIBBON,
        paint: {
          "fill-extrusion-color": "#22c55e",
          "fill-extrusion-opacity": 0.5,
          "fill-extrusion-base": baseExpr,
          "fill-extrusion-height": heightExprRibbon,
        },
      });
    }
    if (!map.getLayer(RP_LAYER_ROUTE_LINE)) {
      map.addLayer({
        id: RP_LAYER_ROUTE_LINE,
        type: "line",
        source: RP_SOURCE_ROUTE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#3b82f6",
          "line-width": 3,
          "line-dasharray": [2, 1],
        },
      });
    }
  }, []);

  // Bygg rute-RouteData fra interne punkter (identisk format som 2D).
  const buildRouteData = useCallback((): RouteData => {
    const coords = routePointsRef.current.slice();
    return {
      coordinates: coords,
      totalDistance: calculateTotalDistance(coords),
      areaKm2: calculatePolygonAreaKm2(coords),
    };
  }, []);

  // Emit en endring til parent (Kart.tsx). Lagrer JSON-snapshot for å unngå
  // ping-pong når parent setter controlledRoute basert på vår egen emit.
  const emitRouteChange = useCallback(() => {
    const data = buildRouteData();
    lastEmittedRouteJsonRef.current = JSON.stringify(data);
    onRouteChangeRef.current?.(data);
  }, [buildRouteData]);

  // Markør-bygging
  const buildMarkerEl = (index: number, total: number): HTMLDivElement => {
    const el = document.createElement("div");
    const color =
      index === 0 ? "#16a34a" : index === total - 1 ? "#dc2626" : "#2563eb";
    el.style.cssText = `
      width: 26px; height: 26px; border-radius: 50%;
      background: ${color}; color: white; font-weight: 700; font-size: 12px;
      display: flex; align-items: center; justify-content: center;
      border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.4);
      cursor: grab; user-select: none;
    `;
    el.textContent = String(index + 1);
    return el;
  };

  // Placeholder — definert senere som useCallback. Markører trenger en stabil
  // referanse å kalle ved drag/contextmenu, så vi bruker en ref-indirection.
  const rebuildRouteSourcesRef = useRef<() => void>(() => {});
  const rebuildMarkersRef = useRef<(map: MlMap) => void>(() => {});

  const rebuildMarkers = useCallback((map: MlMap) => {
    // Fjern eksisterende
    routeMarkersRef.current.forEach((m) => { try { m.remove(); } catch {} });
    routeMarkersRef.current = [];
    const points = routePointsRef.current;
    points.forEach((pt, idx) => {
      const el = buildMarkerEl(idx, points.length);
      const marker = new maplibregl.Marker({ element: el, draggable: true })
        .setLngLat([pt.lng, pt.lat])
        .addTo(map);
      marker.on("dragend", () => {
        const ll = marker.getLngLat();
        routePointsRef.current[idx] = { lat: ll.lat, lng: ll.lng };
        rebuildRouteSourcesRef.current();
        emitRouteChange();
      });
      el.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        routePointsRef.current.splice(idx, 1);
        rebuildMarkersRef.current(map);
        rebuildRouteSourcesRef.current();
        emitRouteChange();
      });
      routeMarkersRef.current.push(marker);
    });
  }, [emitRouteChange]);
  rebuildMarkersRef.current = rebuildMarkers;

  // Densifiserer ruten, henter terreng, og bygger tynne polygon-segmenter
  // med base/høyde basert på terrenget (følger terrenget i flightAltitude AGL).
  const rebuildRouteRibbon = useCallback(async (
    points: { lat: number; lng: number }[],
    flightAltitudeM: number,
    ribbonSrc: GeoJSONSource | undefined,
    emptyFC: { type: "FeatureCollection"; features: any[] },
  ) => {
    if (!ribbonSrc) return;
    if (points.length < 2) {
      ribbonSrc.setData(emptyFC as any);
      return;
    }

    // Densifiser: ~40 m mellom prøvepunkter, maks ~250 totalt.
    const SEGMENT_M = 40;
    const MAX_SAMPLES = 250;
    const haversineM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const R = 6371000;
      const dLat = ((b.lat - a.lat) * Math.PI) / 180;
      const dLng = ((b.lng - a.lng) * Math.PI) / 180;
      const la1 = (a.lat * Math.PI) / 180;
      const la2 = (b.lat * Math.PI) / 180;
      const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    };
    let totalM = 0;
    for (let i = 1; i < points.length; i++) totalM += haversineM(points[i - 1], points[i]);
    const targetSamples = Math.min(MAX_SAMPLES, Math.max(2, Math.ceil(totalM / SEGMENT_M) + 1));
    const stepM = totalM / Math.max(1, targetSamples - 1);

    const densified: { lat: number; lng: number }[] = [points[0]];
    let acc = 0;
    let nextTarget = stepM;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const segLen = haversineM(a, b);
      if (segLen <= 0) continue;
      while (acc + segLen >= nextTarget && densified.length < targetSamples - 1) {
        const t = (nextTarget - acc) / segLen;
        densified.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
        nextTarget += stepM;
      }
      acc += segLen;
    }
    densified.push(points[points.length - 1]);

    // Sample terreng for alle densifiserte punkter.
    let elevations: (number | null)[] = [];
    try {
      elevations = await fetchTerrainElevations(densified);
    } catch (err) {
      console.warn("[Map3D] ribbon terrain fetch failed", err);
      elevations = densified.map(() => null);
    }

    // Bygg tynne polygon-segmenter (~3 m bredt).
    const WIDTH_M = 3;
    const features: any[] = [];
    for (let i = 0; i < densified.length - 1; i++) {
      const p1 = densified[i];
      const p2 = densified[i + 1];
      const e1 = elevations[i];
      const e2 = elevations[i + 1];
      const terrainMid = ((typeof e1 === "number" ? e1 : 0) + (typeof e2 === "number" ? e2 : 0)) / 2;

      // Perpendikulær offset i lng/lat (korrigert for breddegrad).
      const dLng = p2.lng - p1.lng;
      const dLat = p2.lat - p1.lat;
      const midLat = (p1.lat + p2.lat) / 2;
      const cosLat = Math.cos((midLat * Math.PI) / 180);
      const dx = dLng * cosLat;
      const dy = dLat;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const halfW = WIDTH_M / 2 / 111320; // ca. meter→grader
      const perpLng = (-dy / len) * halfW / cosLat;
      const perpLat = (dx / len) * halfW;

      const ring: [number, number][] = [
        [p1.lng + perpLng, p1.lat + perpLat],
        [p2.lng + perpLng, p2.lat + perpLat],
        [p2.lng - perpLng, p2.lat - perpLat],
        [p1.lng - perpLng, p1.lat - perpLat],
        [p1.lng + perpLng, p1.lat + perpLat],
      ];

      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [ring] },
        properties: {
          render_base_m: terrainMid,
          render_height_m: terrainMid + flightAltitudeM,
        },
      });
    }

    ribbonSrc.setData({ type: "FeatureCollection", features } as any);
  }, []);

  // Bygg om route-linje + SORA-buffere fra routePointsRef.
  const rebuildRouteSources = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const points = routePointsRef.current;

    const routeSrc = map.getSource(RP_SOURCE_ROUTE) as GeoJSONSource | undefined;
    const ribbonSrc = map.getSource(RP_SOURCE_ROUTE_RIBBON) as GeoJSONSource | undefined;
    const fgSrc = map.getSource(RP_SOURCE_FG) as GeoJSONSource | undefined;
    const contSrc = map.getSource(RP_SOURCE_CONT) as GeoJSONSource | undefined;
    const grbSrc = map.getSource(RP_SOURCE_GRB) as GeoJSONSource | undefined;

    const emptyFC = { type: "FeatureCollection" as const, features: [] };

    // < 2 punkter → bare markører, ingen linje/buffer, ingen terrain-kall.
    if (points.length < 2) {
      routeSrc?.setData(emptyFC);
      ribbonSrc?.setData(emptyFC);
      fgSrc?.setData(emptyFC);
      contSrc?.setData(emptyFC);
      grbSrc?.setData(emptyFC);
      return;
    }

    // Rute-linje
    routeSrc?.setData({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: points.map((p) => [p.lng, p.lat]),
      },
      properties: {},
    } as any);

    // Bygg 3D-ribbon for ruten (følger terrenget i flightAltitude AGL).
    const sora = soraSettingsRef.current;
    const flightAltitudeM = sora?.flightAltitude ?? 120;
    rebuildRouteRibbon(points, flightAltitudeM, ribbonSrc, emptyFC);

    // SORA-buffer (krever soraSettings.enabled — ellers tøm)
    if (!sora?.enabled) {
      fgSrc?.setData(emptyFC);
      contSrc?.setData(emptyFC);
      grbSrc?.setData(emptyFC);
      return;
    }

    const { flightGeography, contingency, groundRiskBuffer } = buildSoraZoneGeoJSON(points, sora);

    // Lag-spesifikk høyde-semantikk (i henhold til SORA-diagram):
    //   FG (grønn):   sylinder fra bakken opp til terreng + flightAltitude
    //   Cont (gul):   sylinder fra bakken opp til terreng + 0.5 × flightAltitude
    //   GRB (rød):    flatt fill-lag draperes på terreng (ingen ekstrusjon)
    const fgHeightAgl = sora.flightAltitude;
    const contHeightAgl = 0.5 * sora.flightAltitude;

    const featureWith = (
      feat: ReturnType<typeof buildSoraZoneGeoJSON>["flightGeography"],
      extraProps: Record<string, any>,
    ) => {
      if (!feat) return emptyFC;
      return {
        type: "FeatureCollection" as const,
        features: [
          {
            ...feat,
            properties: {
              ...feat.properties,
              ...extraProps,
            },
          },
        ],
      };
    };

    // Initialt (før terreng-sample): base = 0, høyde = AGL-verdi.
    fgSrc?.setData(
      featureWith(flightGeography, { render_base_m: 0, render_height_m: fgHeightAgl }) as any,
    );
    contSrc?.setData(
      featureWith(contingency, { render_base_m: 0, render_height_m: contHeightAgl }) as any,
    );
    // GRB er fill-lag — trenger ingen høyde-properties.
    grbSrc?.setData(featureWith(groundRiskBuffer, {}) as any);

    // Debounced terrain-enrichment: bytt til terrain_max_m som base så sonene
    // ikke blir skjult av terrengtopper inne i polygonet.
    if (soraTerrainDebounceRef.current) {
      window.clearTimeout(soraTerrainDebounceRef.current);
    }
    soraTerrainDebounceRef.current = window.setTimeout(async () => {
      const features = [
        { src: fgSrc, feat: flightGeography, agl: fgHeightAgl, key: "rp-fg", isExtrusion: true },
        { src: contSrc, feat: contingency, agl: contHeightAgl, key: "rp-cont", isExtrusion: true },
        { src: grbSrc, feat: groundRiskBuffer, agl: 0, key: "rp-grb", isExtrusion: false },
      ].filter((x) => x.feat && x.src);

      if (features.length === 0) return;

      const samples = await sampleZonesTerrain(
        features.map((f) => ({ key: f.key, geometry: f.feat!.geometry }))
      );

      features.forEach((f) => {
        const sample = samples.get(f.key);
        if (!f.feat || !f.src) return;
        const props: Record<string, any> = { ...f.feat.properties };
        if (sample) {
          props.terrain_min_m = sample.min;
          props.terrain_max_m = sample.max;
        }
        if (f.isExtrusion) {
          // base = terrain_max (over alle terrengtopper i polygonet),
          // høyde = terrain_max + AGL-verdi.
          const baseM = sample ? sample.max : 0;
          props.render_base_m = baseM;
          props.render_height_m = baseM + f.agl;
        }
        f.src.setData({
          type: "FeatureCollection",
          features: [{ ...f.feat, properties: props }],
        } as any);
      });
    }, 200);
  }, []);
  rebuildRouteSourcesRef.current = rebuildRouteSources;



  // ===== Klikk-handler i routePlanning-modus =====
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (modeRef.current !== "routePlanning") return;
      const { lng, lat } = e.lngLat;
      routePointsRef.current.push({ lat, lng });
      rebuildMarkers(map);
      rebuildRouteSources();
      emitRouteChange();
    };
    map.on("click", handleClick);
    return () => {
      try { map.off("click", handleClick); } catch {}
    };
  }, [rebuildMarkers, rebuildRouteSources, emitRouteChange]);

  // ===== Aktiver/deaktiver route-planning-lag når mode endres =====
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (modeRef.current === "routePlanning") {
        addRoutePlanningLayers(map);
        rebuildMarkers(map);
        rebuildRouteSources();
      } else {
        routeMarkersRef.current.forEach((m) => { try { m.remove(); } catch {} });
        routeMarkersRef.current = [];
        removeRoutePlanningLayers(map);
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("idle", apply);
  }, [mode, addRoutePlanningLayers, removeRoutePlanningLayers, rebuildMarkers, rebuildRouteSources]);

  // ===== Sync controlledRoute / existingRoute fra parent =====
  useEffect(() => {
    if (mode !== "routePlanning") return;
    const route = controlledRoute ?? existingRoute;
    if (!route) return;
    const incomingJson = JSON.stringify({
      coordinates: route.coordinates ?? [],
      totalDistance: route.totalDistance ?? 0,
      areaKm2: route.areaKm2 ?? 0,
    });
    if (incomingJson === lastEmittedRouteJsonRef.current) return;
    routePointsRef.current = (route.coordinates ?? []).map((p) => ({ lat: p.lat, lng: p.lng }));
    lastEmittedRouteJsonRef.current = incomingJson;
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) {
      rebuildMarkers(map);
      rebuildRouteSources();
    } else {
      map.once("idle", () => {
        rebuildMarkers(map);
        rebuildRouteSources();
      });
    }
  }, [mode, controlledRoute, existingRoute, rebuildMarkers, rebuildRouteSources]);

  // ===== Reager på soraSettings-endringer =====
  useEffect(() => {
    if (mode !== "routePlanning") return;
    rebuildRouteSources();
  }, [soraSettings, mode, rebuildRouteSources]);

  // ===== Re-attach route-planning-lag etter style-swap =====
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onStyle = () => {
      if (modeRef.current !== "routePlanning") return;
      // setStyle har fjernet våre lag — re-registrer og fyll på nytt.
      addRoutePlanningLayers(map);
      rebuildRouteSources();
    };
    map.on("styledata", onStyle);
    return () => {
      try { map.off("styledata", onStyle); } catch {}
    };
  }, [addRoutePlanningLayers, rebuildRouteSources]);

  const cycleBase = () => {
    setBase((b) => (b === "satellite" ? "topo" : b === "topo" ? "osm" : "satellite"));
  };






  return (
    <div className="absolute inset-0">
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/*
        MapLibre NavigationControl (zoom +/-, kompass) plasseres
        i "top-right" av kartet (via map.addControl). Vår egen knapp plasseres
        rett under den, slik at ingenting overlapper. Nav-kontrollen tar ca. 6rem.
      */}

      {/* Egen knapp-stack — rett under MapLibre-navigasjon (zoom + kompass) */}
      <div className="absolute top-[6.5rem] right-2 z-[1100] flex flex-col gap-2">
        {/* Base-toggle (satellitt/topo/standard) */}
        <Button
          variant="secondary"
          size="icon"
          onClick={cycleBase}
          className="shadow-lg bg-card hover:bg-accent"
          title={
            base === "satellite"
              ? "Bytt til topografisk kart"
              : base === "topo"
              ? "Bytt til standard kart"
              : "Bytt til satellittkart"
          }
          aria-label="Bytt grunnkart"
        >
          {base === "satellite" ? <Mountain className="h-5 w-5" /> : base === "topo" ? <MapIcon className="h-5 w-5" /> : <Satellite className="h-5 w-5" />}
        </Button>

        {/* Ekstra slot — f.eks. 2D/3D-toggle fra parent */}
        {extraStackSlot}
      </div>
    </div>
  );
}
