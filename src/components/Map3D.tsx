/**
 * Map3D — DIAGNOSTIC MINIMAL VERSION (on-screen panel)
 *
 * Renders state directly on screen so we don't depend on console capture.
 */

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface Map3DProps {
  initialCenter?: [number, number];
  initialZoom?: number;
  onMissionClick?: (mission: any) => void;
}

type Diag = {
  effectRan: boolean;
  containerSize: string;
  containerSizeAfterResize: string;
  maplibreVersion: string;
  webgl1: string;
  webgl2: string;
  ctorStatus: string;
  loadEvent: boolean;
  idleEvent: boolean;
  styledata: number;
  osmTilesLoaded: boolean;
  errors: string[];
  contextLost: boolean;
  contextRestored: boolean;
};

const initial: Diag = {
  effectRan: false,
  containerSize: "?",
  containerSizeAfterResize: "?",
  maplibreVersion: "?",
  webgl1: "?",
  webgl2: "?",
  ctorStatus: "not run",
  loadEvent: false,
  idleEvent: false,
  styledata: 0,
  osmTilesLoaded: false,
  errors: [],
  contextLost: false,
  contextRestored: false,
};

function probeWebGL() {
  const c = document.createElement("canvas");
  let gl1 = "no";
  let gl2 = "no";
  try {
    const ctx1 = c.getContext("webgl") || (c as any).getContext("experimental-webgl");
    gl1 = ctx1 ? "yes" : "no";
  } catch (e: any) {
    gl1 = "throw: " + (e?.message ?? e);
  }
  try {
    const ctx2 = c.getContext("webgl2");
    gl2 = ctx2 ? "yes" : "no";
  } catch (e: any) {
    gl2 = "throw: " + (e?.message ?? e);
  }
  return { gl1, gl2 };
}

export default function Map3D({ initialCenter, initialZoom = 11 }: Map3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [diag, setDiag] = useState<Diag>(initial);
  const diagRef = useRef<Diag>(initial);
  const update = (patch: Partial<Diag>) => {
    diagRef.current = { ...diagRef.current, ...patch };
    setDiag(diagRef.current);
  };

  useEffect(() => {
    const el = containerRef.current;
    const { gl1, gl2 } = probeWebGL();
    update({
      effectRan: true,
      maplibreVersion: String((maplibregl as any).version ?? "unknown"),
      webgl1: gl1,
      webgl2: gl2,
      containerSize: el ? `${el.clientWidth} x ${el.clientHeight}` : "no-el",
    });
    console.log("[Map3D] mount", { el, gl1, gl2, version: (maplibregl as any).version });

    if (!el) {
      update({ ctorStatus: "no container ref" });
      return;
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
      update({ ctorStatus: "OK" });
      console.log("[Map3D] ctorStatus OK");
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      update({ ctorStatus: "THREW: " + msg, errors: [...diagRef.current.errors, msg] });
      console.error("[Map3D] ctorStatus threw", err);
      return;
    }

    // WebGL context lost/restored
    const canvas = map.getCanvas?.();
    if (canvas) {
      canvas.addEventListener("webglcontextlost", (e) => {
        e.preventDefault();
        update({ contextLost: true });
        console.error("[Map3D] webglcontextlost");
      });
      canvas.addEventListener("webglcontextrestored", () => {
        update({ contextRestored: true });
        console.log("[Map3D] webglcontextrestored");
      });
    }

    map.on("load", () => {
      update({ loadEvent: true });
      console.log("[Map3D] load");
    });
    map.on("idle", () => {
      if (!diagRef.current.idleEvent) update({ idleEvent: true });
    });
    map.on("styledata", () => {
      update({ styledata: diagRef.current.styledata + 1 });
    });
    map.on("error", (e: any) => {
      const msg = e?.error?.message ?? String(e?.error ?? "unknown error");
      update({ errors: [...diagRef.current.errors, msg].slice(-5) });
      console.error("[Map3D] error event", e);
    });
    map.on("sourcedata", (e: any) => {
      if (e.sourceId === "osm" && e.isSourceLoaded && !diagRef.current.osmTilesLoaded) {
        update({ osmTilesLoaded: true });
      }
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    // Resize after a tick to handle late layout
    const t = window.setTimeout(() => {
      try {
        map.resize();
        update({
          containerSizeAfterResize: el ? `${el.clientWidth} x ${el.clientHeight}` : "no-el",
        });
      } catch (err: any) {
        console.error("[Map3D] resize threw", err);
      }
    }, 300);

    return () => {
      window.clearTimeout(t);
      try { map.remove(); } catch { /* noop */ }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" style={{ background: "#222" }} />
      <div
        className="absolute top-14 left-3 z-[700] bg-black/85 text-white border border-white/20 rounded px-3 py-2 text-xs font-mono leading-relaxed shadow-xl max-w-[92vw]"
        style={{ whiteSpace: "pre-wrap" }}
      >
        {`Map3D diag
effectRan:       ${diag.effectRan}
container:       ${diag.containerSize}
container@300ms: ${diag.containerSizeAfterResize}
maplibre:        ${diag.maplibreVersion}
webgl1:          ${diag.webgl1}
webgl2:          ${diag.webgl2}
ctorStatus:     ${diag.ctorStatus}
load event:      ${diag.loadEvent}
idle event:      ${diag.idleEvent}
styledata count: ${diag.styledata}
osm tiles ok:    ${diag.osmTilesLoaded}
ctx lost:        ${diag.contextLost}
ctx restored:    ${diag.contextRestored}
errors:
${diag.errors.length ? diag.errors.map((e) => "  - " + e).join("\n") : "  (none)"}`}
      </div>
    </div>
  );
}
