/**
 * Map3D — DIAGNOSTIC MINIMAL VERSION
 *
 * Stripped to bare-minimum MapLibre setup to identify why the 3D map renders blank.
 * Once we have console output, we re-enable terrain → buildings → AviSafe layers in steps.
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
    console.log(
      "[Map3D] mount, container =", el,
      "size =", el?.clientWidth, "x", el?.clientHeight,
      "maplibre version =", (maplibregl as any).version,
    );
    if (!el) {
      console.error("[Map3D] no container ref");
      return;
    }
    if (el.clientWidth === 0 || el.clientHeight === 0) {
      console.warn("[Map3D] container has zero size — map will not render visibly");
    }

    let map: MlMap;
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
            // Magenta background = "MapLibre canvas is alive but no tiles loaded"
            { id: "bg", type: "background", paint: { "background-color": "#ff00ff" } },
            { id: "osm", type: "raster", source: "osm" },
          ],
        },
        center: initialCenter ? [initialCenter[1], initialCenter[0]] : [10.7522, 59.9139],
        zoom: initialZoom,
        pitch: 0,
        bearing: 0,
      });
      mapRef.current = map;
      console.log("[Map3D] Map constructor returned OK");
    } catch (err) {
      console.error("[Map3D] Map constructor THREW", err);
      return;
    }

    map.on("load",      () => console.log("[Map3D] event: load"));
    map.on("idle",      () => console.log("[Map3D] event: idle (first paint done)"));
    map.on("styledata", () => console.log("[Map3D] event: styledata"));
    map.on("error", (e: any) => {
      console.error("[Map3D] event: ERROR", {
        message: e?.error?.message,
        status: e?.error?.status,
        url: e?.error?.url,
        raw: e,
      });
    });
    map.on("sourcedata", (e: any) => {
      if (e.sourceId === "osm" && e.isSourceLoaded) {
        console.log("[Map3D] event: OSM tiles loaded");
      }
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    /* ----------------------------------------------------------------------
     * Everything below intentionally disabled for diagnostics.
     * Re-enable in order: terrain → hillshade → 3D buildings → AviSafe layers.
     * --------------------------------------------------------------------- */
    // map.on("load", () => addTerrain(map));
    // map.on("load", () => addBuildings(map));
    // map.on("load", () => addOperationalLayers(map));

    return () => {
      try {
        map.remove();
      } catch {
        /* noop */
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" style={{ background: "#222" }} />
      <div className="absolute top-3 left-3 z-[500] bg-card/90 border border-border rounded px-2 py-1 text-xs font-mono">
        Map3D: diagnostic mode — check console
      </div>
    </div>
  );
}
