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

const SAFESKY_MODEL_URL = "/models/dji_matrice_t300/scene.gltf";

interface Map3DProps {
  initialCenter?: [number, number];
  initialZoom?: number;
  onMissionClick?: (mission: any) => void;
  onViewChange?: (center: [number, number], zoom: number) => void;
  /** Ekstra knapp/element som rendres rett under base-layer-knappen i høyre stack. */
  extraStackSlot?: React.ReactNode;
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




export default function Map3D({ initialCenter, initialZoom = 12, onViewChange }: Map3DProps) {
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
      safeskyModelLayerRef.current?.destroy();
      safeskyModelLayerRef.current = null;
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

      {/* Egen kart-knapp — rett under MapLibre-navigasjon */}
      <div className="absolute top-[6.5rem] right-2 z-[1100]">
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

      </div>
    </div>
  );
}
