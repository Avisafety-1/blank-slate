/**
 * Map3D — MapLibre 3D-kart med OSM/satellitt/topo base + AWS Terrarium terreng.
 * Steg A: base-toggle som speiler 2D-kartet.
 */

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MlMap, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Button } from "@/components/ui/button";
import { Satellite, Mountain, Map as MapIcon } from "lucide-react";

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

export default function Map3D({ initialCenter, initialZoom = 12 }: Map3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [base, setBase] = useState<BaseLayer>("osm");

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

    const t = window.setTimeout(() => { try { map!.resize(); } catch {} }, 300);

    return () => {
      window.clearTimeout(t);
      try { map?.remove(); } catch {}
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bytt grunnkart uten å bygge kartet på nytt
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      map.setStyle(buildStyle(base));
    } catch (err) {
      console.error("[Map3D] setStyle failed", err);
    }
  }, [base]);

  const cycleBase = () => {
    setBase((b) => (b === "osm" ? "satellite" : b === "satellite" ? "topo" : "osm"));
  };

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Base-toggle — samme posisjon/størrelse som 2D-kartet sin base-knapp */}
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
    </div>
  );
}
