import L from "leaflet";

/**
 * Hover-baserte forsterkninger på kart-features:
 *  1) Løfter pane-z midlertidig så hovret lag legger seg øverst (mellom panes).
 *  2) Bringer feature-laget til toppen innen pane (innen-pane DOM-orden).
 *  3) Subtil visuell hover (tykkere stroke, høyere fillOpacity).
 *
 * Restaureres på mouseout / layer remove.
 */

const HOVER_Z = 760; // under safeskyPane (750? -> bruk 745 if conflict). safesky=750, live=720.
// safeskyPane=750 er det høyeste. Vi vil ligge under live-trafikk for klikk-prioritet.
// Bruk 745: høyere enn alt annet polygon-innhold, men under safeskyPane(750) og liveFlightPane(720)?
// Faktisk: vi vil at hovret geosone skal klikkes selv om den ligger under safesky-fly hvis musen er på sonen, ikke på flyet.
// Leaflet sin hit-test går på DOM/pointer-events. Hvis flyet ligger over og musen er ikke på flyet, treffer geosonen.
// 745 holder oss under safesky men over alt annet.
const PANE_HOVER_Z = 745;

const paneHoverCounts = new WeakMap<HTMLElement, number>();
const paneOriginalZ = new WeakMap<HTMLElement, string>();

function promotePane(map: L.Map | undefined, paneName: string) {
  const pane = map?.getPane(paneName);
  if (!pane) return;
  const count = (paneHoverCounts.get(pane) ?? 0) + 1;
  paneHoverCounts.set(pane, count);
  if (count === 1) {
    paneOriginalZ.set(pane, pane.style.zIndex || "");
    pane.style.zIndex = String(PANE_HOVER_Z);
  }
}

function demotePane(map: L.Map | undefined, paneName: string) {
  const pane = map?.getPane(paneName);
  if (!pane) return;
  const count = (paneHoverCounts.get(pane) ?? 1) - 1;
  if (count <= 0) {
    paneHoverCounts.delete(pane);
    const orig = paneOriginalZ.get(pane);
    if (orig !== undefined) {
      pane.style.zIndex = orig;
      paneOriginalZ.delete(pane);
    }
  } else {
    paneHoverCounts.set(pane, count);
  }
}

export interface HoverPromotionOptions {
  paneName?: string;
  /** Original style (style + setStyle påført ved mouseout). */
  baseStyle?: L.PathOptions;
  /** Style som påføres ved hover (slås sammen med base). Default: weight+1, fillOpacity+0.15. */
  hoverStyle?: L.PathOptions;
  /** Hvis modeRef er satt og current==='routePlanning' -> ingen hover-effekt. */
  modeRef?: { current: string };
}

/**
 * Fester hover-effekt på et Leaflet feature-layer (Path/Marker).
 * Idempotent — skipper hvis allerede festet.
 */
export function attachHoverPromotion(layer: L.Layer, opts: HoverPromotionOptions = {}) {
  if ((layer as any).__hoverPromotion) return;
  (layer as any).__hoverPromotion = true;

  const paneName = opts.paneName;
  const path = layer as any as L.Path;
  const hasSetStyle = typeof (path as any)?.setStyle === "function";

  // Beregn base style fra opts eller fra layer.options
  const baseStyle: L.PathOptions = { ...(opts.baseStyle ?? (path as any).options ?? {}) };
  const baseWeight = typeof baseStyle.weight === "number" ? baseStyle.weight : 2;
  const baseFill = typeof baseStyle.fillOpacity === "number" ? baseStyle.fillOpacity : 0.15;
  const hoverStyle: L.PathOptions = {
    weight: baseWeight + 1,
    fillOpacity: Math.min(baseFill + 0.18, 0.65),
    ...(opts.hoverStyle ?? {}),
  };

  let active = false;

  const onOver = () => {
    if (opts.modeRef?.current === "routePlanning") return;
    if (active) return;
    active = true;
    const map = (layer as any)._map as L.Map | undefined;
    if (paneName && map) promotePane(map, paneName);
    try {
      if (hasSetStyle) (path as any).setStyle(hoverStyle);
      if (typeof (layer as any).bringToFront === "function") {
        (layer as any).bringToFront();
      }
    } catch {}
  };

  const onOut = () => {
    if (!active) return;
    active = false;
    const map = (layer as any)._map as L.Map | undefined;
    if (paneName && map) demotePane(map, paneName);
    try {
      if (hasSetStyle) (path as any).setStyle(baseStyle);
    } catch {}
  };

  layer.on("mouseover", onOver);
  layer.on("mouseout", onOut);
  layer.on("remove", () => {
    // Sørg for at counter ikke henger om laget fjernes mens hovret
    if (active) onOut();
  });
}

/**
 * Fester hover-effekt på alle child-layers i en L.GeoJSON.
 */
export function attachHoverPromotionToGeoJson(
  gj: L.GeoJSON,
  opts: HoverPromotionOptions = {},
) {
  gj.eachLayer((child) => attachHoverPromotion(child, opts));
}
