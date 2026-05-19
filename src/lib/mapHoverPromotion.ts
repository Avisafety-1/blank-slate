import L from "leaflet";

/**
 * Smart hover-promotion på kart-features:
 * - Global mousemove på kartet finner alle registrerte polygoner som inneholder musa,
 *   og velger den med MINST areal (mest spesifikke).
 * - Den vinnende sonen får visuell hover-effekt (tykkere strek, mer fyll),
 *   bringes til front i sitt pane, og pane-z løftes midlertidig så klikk treffer riktig.
 *
 * Dette løser problemet der en stor sone (f.eks. CTR) blokkerer mouseover på mindre
 * overlappende soner (NSM, RPAS 5km, flyplass) — fordi vi ikke baserer oss på SVG
 * hit-test, men på geometrisk point-in-polygon over alle registrerte lag.
 */

// Ligger over alle polygon-paner (nsmPane=650) men UNDER marker-paner
// (airportPane=670, notamPinPane=675, missionPane=680) — slik at pins/ikoner
// fortsatt mottar mouse-events selv når et stort polygon under er hovret.
const PANE_HOVER_Z = 668;

interface Registered {
  layer: L.Layer;
  paneName?: string;
  baseStyle: L.PathOptions;
  hoverStyle: L.PathOptions;
  modeRef?: { current: string };
  approxArea: number;
}

const registry = new Map<L.Map, Set<Registered>>();
const mapHandlers = new WeakMap<L.Map, true>();
const paneOriginalZ = new WeakMap<HTMLElement, string>();
let currentHover: { reg: Registered; map: L.Map } | null = null;

function collectRings(latlngs: any, out: L.LatLng[][]) {
  if (!latlngs) return;
  if (Array.isArray(latlngs)) {
    if (latlngs.length && latlngs[0] instanceof L.LatLng) {
      out.push(latlngs as L.LatLng[]);
    } else {
      for (const child of latlngs) collectRings(child, out);
    }
  }
}

function ringContains(ring: L.LatLng[], pt: L.LatLng): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng, yi = ring[i].lat;
    const xj = ring[j].lng, yj = ring[j].lat;
    const intersect =
      yi > pt.lat !== yj > pt.lat &&
      pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function layerContains(layer: any, pt: L.LatLng): boolean {
  const b = typeof layer.getBounds === "function" ? layer.getBounds() : null;
  if (b && !b.contains(pt)) return false;

  // Circle / CircleMarker
  if (typeof layer.getRadius === "function" && typeof layer.getLatLng === "function") {
    const center = layer.getLatLng();
    const r = layer.getRadius();
    // CircleMarker har pikselradius — bruk bounds-fallback
    if (layer instanceof L.Circle) {
      return center.distanceTo(pt) <= r;
    }
    return true; // bounds-treff er nok
  }

  if (typeof layer.getLatLngs !== "function") return !!b;

  const rings: L.LatLng[][] = [];
  collectRings(layer.getLatLngs(), rings);
  if (!rings.length) return !!b;

  // Even-odd: count innesluttende ringer; oddetall => inni
  let count = 0;
  for (const r of rings) if (ringContains(r, pt)) count++;
  return count % 2 === 1;
}

function approxArea(layer: any): number {
  const b = typeof layer.getBounds === "function" ? layer.getBounds() : null;
  if (!b) return Infinity;
  const w = b.getEast() - b.getWest();
  const h = b.getNorth() - b.getSouth();
  return Math.max(w * h, 1e-12);
}

function applyHover(reg: Registered, map: L.Map) {
  const layer = reg.layer as any;
  if (reg.paneName) {
    const pane = map.getPane(reg.paneName);
    if (pane) {
      if (!paneOriginalZ.has(pane)) {
        paneOriginalZ.set(pane, pane.style.zIndex || "");
      }
      pane.style.zIndex = String(PANE_HOVER_Z);
    }
  }
  try {
    if (typeof layer.setStyle === "function") layer.setStyle(reg.hoverStyle);
    if (typeof layer.bringToFront === "function") layer.bringToFront();
  } catch {}
  currentHover = { reg, map };
}

function clearHover() {
  if (!currentHover) return;
  const { reg, map } = currentHover;
  const layer = reg.layer as any;
  if (reg.paneName) {
    const pane = map.getPane(reg.paneName);
    if (pane) {
      const orig = paneOriginalZ.get(pane);
      if (orig !== undefined) {
        pane.style.zIndex = orig;
        paneOriginalZ.delete(pane);
      }
    }
  }
  try {
    if (typeof layer.setStyle === "function") layer.setStyle(reg.baseStyle);
  } catch {}
  currentHover = null;
}

function ensureHandler(map: L.Map) {
  if (mapHandlers.has(map)) return;
  mapHandlers.set(map, true);

  const onMove = (e: L.LeafletMouseEvent) => {
    const set = registry.get(map);
    if (!set || set.size === 0) {
      if (currentHover?.map === map) clearHover();
      return;
    }
    let best: Registered | null = null;
    let bestArea = Infinity;
    for (const reg of set) {
      if (reg.modeRef?.current === "routePlanning") continue;
      const layer = reg.layer as any;
      if (!layer._map) continue;
      if (!layerContains(layer, e.latlng)) continue;
      if (reg.approxArea < bestArea) {
        bestArea = reg.approxArea;
        best = reg;
      }
    }
    if (best !== currentHover?.reg) {
      clearHover();
      if (best) applyHover(best, map);
    }
  };
  const onLeave = () => clearHover();

  map.on("mousemove", onMove);
  map.on("mouseout", onLeave);
}

export interface HoverPromotionOptions {
  paneName?: string;
  baseStyle?: L.PathOptions;
  hoverStyle?: L.PathOptions;
  modeRef?: { current: string };
}

export function attachHoverPromotion(layer: L.Layer, opts: HoverPromotionOptions = {}) {
  if ((layer as any).__hoverPromotion) return;
  (layer as any).__hoverPromotion = true;

  const path = layer as any;
  const baseStyle: L.PathOptions = { ...(opts.baseStyle ?? path.options ?? {}) };
  const baseWeight = typeof baseStyle.weight === "number" ? baseStyle.weight : 2;
  const baseFill = typeof baseStyle.fillOpacity === "number" ? baseStyle.fillOpacity : 0.15;
  const hoverStyle: L.PathOptions = {
    weight: baseWeight + 1,
    fillOpacity: Math.min(baseFill + 0.18, 0.65),
    ...(opts.hoverStyle ?? {}),
  };

  const register = () => {
    const map = path._map as L.Map | undefined;
    if (!map) return;
    let set = registry.get(map);
    if (!set) {
      set = new Set();
      registry.set(map, set);
    }
    const reg: Registered = {
      layer,
      paneName: opts.paneName,
      baseStyle,
      hoverStyle,
      modeRef: opts.modeRef,
      approxArea: approxArea(path),
    };
    (layer as any).__hoverReg = reg;
    set.add(reg);
    ensureHandler(map);
  };

  if (path._map) {
    register();
  } else {
    layer.once("add", register);
  }

  layer.on("remove", () => {
    const reg = (layer as any).__hoverReg as Registered | undefined;
    const map = path._map as L.Map | undefined;
    if (reg && map) {
      registry.get(map)?.delete(reg);
      if (currentHover?.reg === reg) clearHover();
    }
  });
}
