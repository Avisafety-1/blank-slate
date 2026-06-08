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
import { Satellite, Mountain, Map as MapIcon, Shield, Box } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildCaaZonePopupHtml,
  buildDkZonePopupHtml,
  defaultUpperLimitM,
  zoneSource,
} from "@/lib/zonePopups";

interface Map3DProps {
  initialCenter?: [number, number];
  initialZoom?: number;
  onMissionClick?: (mission: any) => void;
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
    // 3D-sylindere: base = lower_limit_m, høyde = upper_limit_m (med kategori-aware fallback).
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
    // Flat fill (bakkenivå)
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

export default function Map3D({ initialCenter, initialZoom = 12 }: Map3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const fetchTimerRef = useRef<number | null>(null);
  const [base, setBase] = useState<BaseLayer>("osm");
  const [zonesEnabled, setZonesEnabled] = useState(true);
  const [extrude, setExtrude] = useState(true);
  const extrudeRef = useRef(extrude);
  extrudeRef.current = extrude;

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

  // Popup-click handler (felles for fill/extrusion/point)
  const installClickHandlers = useCallback((map: MlMap) => {
    const showPopup = (e: maplibregl.MapMouseEvent & { features?: any[] }) => {
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
    const setCursor = (cursor: string) => () => {
      map.getCanvas().style.cursor = cursor;
    };
    ["zones-fill", "zones-extrusion", "zones-point"].forEach((layerId) => {
      map.on("click", layerId, showPopup);
      map.on("mouseenter", layerId, setCursor("pointer"));
      map.on("mouseleave", layerId, setCursor(""));
    });
  }, []);

  // Init map
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let map: MlMap | null = null;
    try {
      map = new maplibregl.Map({
        container: el,
        style: buildStyle("osm"),
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
      installClickHandlers(map!);
      refreshZones();
    });

    const debouncedRefresh = () => {
      if (fetchTimerRef.current) window.clearTimeout(fetchTimerRef.current);
      fetchTimerRef.current = window.setTimeout(() => refreshZones(), 300);
    };
    map.on("moveend", debouncedRefresh);

    const t = window.setTimeout(() => { try { map!.resize(); } catch {} }, 300);

    return () => {
      window.clearTimeout(t);
      if (fetchTimerRef.current) window.clearTimeout(fetchTimerRef.current);
      try { map?.remove(); } catch {}
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bytt grunnkart uten å bygge kartet på nytt — gjenoppretter sonelagene
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      map.setStyle(buildStyle(base));
      map.once("idle", () => {
        addZoneLayers(map, extrudeRef.current);
        installClickHandlers(map);
        refreshZones();
      });
    } catch (err) {
      console.error("[Map3D] setStyle failed", err);
    }
  }, [base, refreshZones, installClickHandlers]);

  // Toggle 3D-sylindere vs flat fill — fjern og legg til lag på nytt
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    try {
      ["zones-fill", "zones-extrusion", "zones-outline", "zones-point"].forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      if (map.getSource("zones")) map.removeSource("zones");
      addZoneLayers(map, extrude);
      installClickHandlers(map);
      refreshZones();
    } catch (err) {
      console.error("[Map3D] toggle extrude failed", err);
    }
  }, [extrude, installClickHandlers, refreshZones]);

  // Toggle zones (data)
  useEffect(() => {
    refreshZones();
  }, [zonesEnabled, refreshZones]);



  const cycleBase = () => {
    setBase((b) => (b === "osm" ? "satellite" : b === "satellite" ? "topo" : "osm"));
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
          base === "osm"
            ? "Bytt til satellittkart"
            : base === "satellite"
            ? "Bytt til topografisk kart"
            : "Bytt til standard kart"
        }
        aria-label="Bytt grunnkart"
      >
        {base === "osm" ? <Satellite className="h-5 w-5" /> : base === "satellite" ? <Mountain className="h-5 w-5" /> : <MapIcon className="h-5 w-5" />}
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
    </div>
  );
}
