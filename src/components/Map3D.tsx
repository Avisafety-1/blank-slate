/**
 * Map3D — DIAGNOSTIC: layout/visibility tracking
 *
 * Walks the parent chain, tracks container/canvas sizes over time,
 * adds colored borders to expose stacking and collapse.
 */

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface Map3DProps {
  initialCenter?: [number, number];
  initialZoom?: number;
  onMissionClick?: (mission: any) => void;
}

type Snap = { t: string; container: string; canvasClient: string; canvasAttr: string };
type AncestorRow = { tag: string; cls: string; size: string; css: string };

export default function Map3D({ initialCenter, initialZoom = 11 }: Map3DProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);

  const [ctorStatus, setCtorStatus] = useState("not run");
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [ancestors, setAncestors] = useState<AncestorRow[]>([]);
  const [sizeLog, setSizeLog] = useState<string[]>([]);

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
      setCtorStatus("OK");

      // GREEN border on the canvas itself
      const canvas = map.getCanvas();
      if (canvas) {
        canvas.style.outline = "2px solid #00ff00";
        canvas.style.outlineOffset = "-2px";
      }
    } catch (err: any) {
      setCtorStatus("THREW: " + (err?.message ?? String(err)));
      return;
    }

    const snapshot = (label: string) => {
      const c = containerRef.current;
      const canvas = map!.getCanvas?.();
      const containerSize = c ? `${c.clientWidth} x ${c.clientHeight}` : "no-el";
      const canvasClient = canvas ? `${canvas.clientWidth} x ${canvas.clientHeight}` : "no-canvas";
      const canvasAttr = canvas ? `${canvas.width} x ${canvas.height}` : "no-canvas";
      setSnaps((prev) => [...prev, { t: label, container: containerSize, canvasClient, canvasAttr }]);
    };

    const walkAncestors = () => {
      const rows: AncestorRow[] = [];
      let node: HTMLElement | null = containerRef.current;
      let depth = 0;
      while (node && depth < 12) {
        const cs = getComputedStyle(node);
        rows.push({
          tag: node.tagName.toLowerCase(),
          cls: (node.className || "").toString().slice(0, 60),
          size: `${node.clientWidth}x${node.clientHeight}`,
          css: `d=${cs.display} p=${cs.position} h=${cs.height} mh=${cs.minHeight} ov=${cs.overflow}`,
        });
        node = node.parentElement;
        depth++;
      }
      setAncestors(rows);
    };

    snapshot("t=0");
    walkAncestors();
    const t1 = window.setTimeout(() => { snapshot("t=300"); walkAncestors(); try { map!.resize(); } catch {} }, 300);
    const t2 = window.setTimeout(() => { snapshot("t=1000"); walkAncestors(); try { map!.resize(); } catch {} }, 1000);
    const t3 = window.setTimeout(() => { snapshot("t=3000"); walkAncestors(); try { map!.resize(); } catch {} }, 3000);

    // ResizeObserver on container
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      const w = Math.round(e.contentRect.width);
      const h = Math.round(e.contentRect.height);
      const ts = Math.round(performance.now());
      setSizeLog((prev) => [...prev.slice(-5), `${ts}ms: ${w}x${h}`]);
    });
    ro.observe(el);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      ro.disconnect();
      try { map?.remove(); } catch {}
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0"
      style={{ outline: "2px solid #3b82f6", outlineOffset: "-2px" }}
    >
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ background: "#222", outline: "2px solid #ef4444", outlineOffset: "-4px" }}
      />
      <div
        className="absolute top-14 left-3 z-[700] bg-black/90 text-white border border-white/20 rounded px-3 py-2 text-[10px] font-mono leading-snug shadow-xl max-w-[92vw] max-h-[80vh] overflow-auto"
        style={{ whiteSpace: "pre-wrap" }}
      >
        {`Map3D layout diag
ctor: ${ctorStatus}
borders: wrapper=blue, container=red, canvas=green

snapshots:
${snaps.map((s) => `  ${s.t}: container=${s.container}  canvas(client)=${s.canvasClient}  canvas(attr)=${s.canvasAttr}`).join("\n") || "  (none)"}

resize observer (last 6):
${sizeLog.map((l) => "  " + l).join("\n") || "  (none)"}

ancestor chain (container → body):
${ancestors.map((a, i) => `  [${i}] <${a.tag}> ${a.size}  ${a.css}\n      cls="${a.cls}"`).join("\n") || "  (none)"}`}
      </div>
    </div>
  );
}
