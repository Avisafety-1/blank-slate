/**
 * Map3D — OSM raster + AWS Terrarium DEM terrain (free, no API key).
 * Step 2: terrain enabled with hillshade + pitch.
 */

import { useEffect, useRef } from "react";
import maplibregl, { Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface Map3DProps {
  initialCenter?: [number, number];
  initialZoom?: number;
  onMissionClick?: (mission: any) => void;
}

export default function Map3D({ initialCenter, initialZoom = 12 }: Map3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let map: MlMap | null = null;
    try {
      map = new maplibregl.Map({
        container: el,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: [
                "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
                "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
                "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
              ],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors",
            },
            terrainSource: {
              type: "raster-dem",
              tiles: [
                "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
              ],
              tileSize: 256,
              encoding: "terrarium",
              maxzoom: 14,
              attribution: "© Mapzen / AWS Terrain Tiles",
            },
            hillshadeSource: {
              type: "raster-dem",
              tiles: [
                "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
              ],
              tileSize: 256,
              encoding: "terrarium",
              maxzoom: 14,
            },
          },
          layers: [
            { id: "bg", type: "background", paint: { "background-color": "#cfe2f3" } },
            { id: "osm", type: "raster", source: "osm" },
            {
              id: "hillshade",
              type: "hillshade",
              source: "hillshadeSource",
              paint: { "hillshade-exaggeration": 0.4 },
            },
          ],
          terrain: { source: "terrainSource", exaggeration: 1.3 },
        },
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

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
