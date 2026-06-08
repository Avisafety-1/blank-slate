/**
 * Map3D — minimal OSM verification build.
 * Fix: maplibre adds class `maplibregl-map { position: relative }` which
 * overrides Tailwind `absolute inset-0` on the container, collapsing it to
 * height 0. Use explicit width/height: 100% instead.
 */

import { useEffect, useRef } from "react";
import maplibregl, { Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface Map3DProps {
  initialCenter?: [number, number];
  initialZoom?: number;
  onMissionClick?: (mission: any) => void;
}

export default function Map3D({ initialCenter, initialZoom = 11 }: Map3DProps) {
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
          },
          layers: [
            { id: "bg", type: "background", paint: { "background-color": "#cfe2f3" } },
            { id: "osm", type: "raster", source: "osm" },
          ],
        },
        center: initialCenter ? [initialCenter[1], initialCenter[0]] : [10.7522, 59.9139],
        zoom: initialZoom,
        pitch: 0,
        bearing: 0,
      });
      mapRef.current = map;
    } catch (err) {
      console.error("[Map3D] init failed", err);
      return;
    }

    map.addControl(new maplibregl.NavigationControl(), "top-right");

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
