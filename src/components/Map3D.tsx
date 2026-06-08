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
import { Satellite, Mountain, Map as MapIcon, Shield, Box, Plane, Radar } from "lucide-react";
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

interface Map3DProps {
  initialCenter?: [number, number];
  initialZoom?: number;
  onMissionClick?: (mission: any) => void;
  onViewChange?: (center: [number, number], zoom: number) => void;
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
        "fill-extrusion-base": ["coalesce", ["get", "lower_limit_m"], 0],
        "fill-extrusion-height": [
          "max",
          50,
          ["coalesce", ["get", "upper_limit_m"], ["get", "fallback_upper_m"], 120],
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
        "fill-extrusion-base": ["coalesce", ["get", "lower_limit_m"], 0],
        "fill-extrusion-height": [
          "max",
          80,
          ["coalesce", ["get", "upper_limit_m"], 1500],
        ],
        "fill-extrusion-opacity": aipOpacityExpression(1.6), // litt mer markant enn flat fill
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


export default function Map3D({ initialCenter, initialZoom = 12, onViewChange }: Map3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const fetchTimerRef = useRef<number | null>(null);
  const [base, setBase] = useState<BaseLayer>("satellite");
  const [zonesEnabled, setZonesEnabled] = useState(true);
  const [aipEnabled, setAipEnabled] = useState(true);
  const [trafficEnabled, setTrafficEnabled] = useState(true);
  const [extrude, setExtrude] = useState(true);
  const extrudeRef = useRef(extrude);
  extrudeRef.current = extrude;
  const aipFetchedRef = useRef(false);
  const aipFeaturesRef = useRef<any[]>([]);
  const trafficEnabledRef = useRef(trafficEnabled);
  trafficEnabledRef.current = trafficEnabled;
  const safeskyIconsLoadedRef = useRef<Set<string>>(new Set());
  const safeskyPollRef = useRef<number | null>(null);
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
    src.setData({
      type: "FeatureCollection",
      features: aipEnabled ? aipFeaturesRef.current : [],
    });
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
    if (map.getSource("safesky")) return;
    map.addSource("safesky", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: "safesky-beacons",
      type: "symbol",
      source: "safesky",
      layout: {
        "icon-image": ["concat", "safesky-", ["coalesce", ["get", "beacon_type"], "UNKNOWN"]],
        "icon-size": 0.85,
        "icon-rotate": ["coalesce", ["get", "course"], 0],
        "icon-rotation-alignment": "map",
        "icon-pitch-alignment": "viewport",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: {
        "icon-opacity": [
          "case",
          [">", ["coalesce", ["get", "altitude"], 0], 610],
          0.55,
          1.0,
        ],
      },
    });
  }, []);

  const refreshSafeSky = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("safesky") as GeoJSONSource | undefined;
    if (!src) return;
    if (!trafficEnabledRef.current) {
      src.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    try {
      const { data, error } = await supabase.from("safesky_beacons").select("*");
      if (error || !data) return;
      // Sørg for at vi har et ikon for hver beacon-type vi nettopp fikk.
      const types = new Set<string>();
      (data as any[]).forEach((b) => types.add(b.beacon_type || "UNKNOWN"));
      await Promise.all(Array.from(types).map((t) => ensureSafeSkyIcon(map, t)));

      const features = (data as any[])
        .filter((b) => b.latitude != null && b.longitude != null)
        .map((b) => ({
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
    } catch (err) {
      console.error("[Map3D] safesky fetch failed", err);
    }
  }, [ensureSafeSkyIcon]);


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
    map.addControl(
      new maplibregl.TerrainControl({ source: "terrainSource", exaggeration: 1.3 }),
      "top-right"
    );

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

    // SafeSky-polling (10s) — samme intervall som 2D
    safeskyPollRef.current = window.setInterval(() => {
      if (trafficEnabledRef.current) refreshSafeSky();
    }, 10000);

    const t = window.setTimeout(() => { try { map!.resize(); } catch {} }, 300);

    return () => {
      window.clearTimeout(t);
      if (fetchTimerRef.current) window.clearTimeout(fetchTimerRef.current);
      if (safeskyPollRef.current) window.clearInterval(safeskyPollRef.current);
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
      map.setStyle(buildStyle(base));
      map.once("idle", () => {
        addZoneLayers(map, extrudeRef.current);
        addAipLayers(map, extrudeRef.current);
        addSafeSkyLayer(map);
        installClickHandlers(map);
        // Re-add ikoner (setStyle tømmer image-cache)
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
        "safesky-beacons",
      ].forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
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

      {/* Base-toggle */}
      <Button
        variant="secondary"
        size="icon"
        onClick={cycleBase}
        className="absolute top-[3.5rem] right-4 z-[1100] shadow-lg bg-card hover:bg-accent"
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

      {/* Dronesone-toggle */}
      <Button
        variant={zonesEnabled ? "default" : "secondary"}
        size="icon"
        onClick={() => setZonesEnabled((v) => !v)}
        className={`absolute top-[6.5rem] right-4 z-[1100] shadow-lg ${zonesEnabled ? "" : "bg-card hover:bg-accent"}`}
        title={zonesEnabled ? "Skjul dronesoner" : "Vis dronesoner (CAA + DK)"}
        aria-label="Dronesoner"
      >
        <Shield className="h-5 w-5" />
      </Button>

      {/* Sylinder / flat-toggle (3D-volum) */}
      <Button
        variant={extrude ? "default" : "secondary"}
        size="icon"
        onClick={() => setExtrude((v) => !v)}
        className={`absolute top-[9.5rem] right-4 z-[1100] shadow-lg ${extrude ? "" : "bg-card hover:bg-accent"}`}
        title={extrude ? "Skjul 3D-sylindere (vis flate soner)" : "Vis soner som 3D-sylindere"}
        aria-label="3D-sylindere"
      >
        <Box className="h-5 w-5" />
      </Button>

      {/* AIP-luftrom-toggle (CTR/TIZ/P/R/D/RMZ/TMZ) */}
      <Button
        variant={aipEnabled ? "default" : "secondary"}
        size="icon"
        onClick={() => setAipEnabled((v) => !v)}
        className={`absolute top-[12.5rem] right-4 z-[1100] shadow-lg ${aipEnabled ? "" : "bg-card hover:bg-accent"}`}
        title={aipEnabled ? "Skjul luftrom (CTR/TIZ/P/R/D)" : "Vis luftrom (CTR/TIZ/P/R/D)"}
        aria-label="Luftrom"
      >
        <Plane className="h-5 w-5" />
      </Button>

      {/* Lufttrafikk (SafeSky) */}
      <Button
        variant={trafficEnabled ? "default" : "secondary"}
        size="icon"
        onClick={() => setTrafficEnabled((v) => !v)}
        className={`absolute top-[15.5rem] right-4 z-[1100] shadow-lg ${trafficEnabled ? "" : "bg-card hover:bg-accent"}`}
        title={trafficEnabled ? "Skjul lufttrafikk (SafeSky)" : "Vis lufttrafikk (SafeSky)"}
        aria-label="Lufttrafikk"
      >
        <Radar className="h-5 w-5" />
      </Button>
    </div>
  );
}
