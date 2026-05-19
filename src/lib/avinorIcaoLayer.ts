import L from "leaflet";

/**
 * Avinor ICAO 1:500 000 VFR-flykart (dynamisk ArcGIS MapServer).
 *
 * To-fase lasting:
 *  1) Rask viewport-last (eksakt størrelse) så brukeren ser kart umiddelbart.
 *  2) Stille bakgrunnslast av et større, padded utsnitt (2× viewport) som
 *     erstatter viewport-bildet når det er klart. Da har vi kart å vise med
 *     én gang ved panorering inne i det paddede området.
 *
 * Hvis nytt viewport fortsatt ligger innenfor sist lastede paddede bounds,
 * gjør vi ingenting (ingen ny request, ingen blink).
 *
 * - devicePixelRatio for skarphet på retina.
 * - Double-buffering: nytt bilde lastes i bakgrunnen, gammelt fjernes
 *   først når nytt er ferdig.
 * - Debouncer moveend (150 ms).
 * - Ingen metadata-XHR (ingen CORS-problemer).
 * - Treffer Avinor direkte; belaster ikke vår backend.
 */
const SERVICE_URL =
  "https://avigis.avinor.no/agsmap/rest/services/ICAO_500000_ExB/MapServer/export";

const DEBOUNCE_MS = 150;
const PRELOAD_DELAY_MS = 400; // vent litt etter viewport-last før vi henter padded
const MAX_PIXELS = 3000;
const MAX_DPR = 2;
const PAD_FACTOR = 1.0; // 1.0 = utvid bbox med 100 % (dvs. 2× på hver akse)

export const AvinorIcaoLayer = L.Layer.extend({
  options: {
    opacity: 1,
    attribution: "ICAO 1:500 000 © Avinor",
    pane: "tilePane",
  },

  onAdd(map: L.Map) {
    this._map = map;
    this._current = null as L.ImageOverlay | null;
    this._currentBounds = null as L.LatLngBounds | null;
    this._pending = null as L.ImageOverlay | null;
    this._reqId = 0;
    this._debounceTimer = null as ReturnType<typeof setTimeout> | null;
    this._preloadTimer = null as ReturnType<typeof setTimeout> | null;

    this._scheduleUpdate = () => {
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => this._onViewportChanged(), DEBOUNCE_MS);
    };

    // Fase 1: viewport-last umiddelbart
    this._loadNext(false);
    map.on("moveend zoomend", this._scheduleUpdate, this);
    return this;
  },

  onRemove(map: L.Map) {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    if (this._preloadTimer) {
      clearTimeout(this._preloadTimer);
      this._preloadTimer = null;
    }
    if (this._current) {
      map.removeLayer(this._current);
      this._current = null;
    }
    if (this._pending) {
      map.removeLayer(this._pending);
      this._pending = null;
    }
    this._currentBounds = null;
    map.off("moveend zoomend", this._scheduleUpdate, this);
    return this;
  },

  setOpacity(opacity: number) {
    this.options.opacity = opacity;
    if (this._current) this._current.setOpacity(opacity);
    if (this._pending) this._pending.setOpacity(opacity);
    return this;
  },

  getAttribution() {
    return this.options.attribution;
  },

  _onViewportChanged() {
    const map = this._map as L.Map | undefined;
    if (!map) return;
    const viewport = map.getBounds();
    // Hvis vi allerede har et padded bilde som dekker viewport → ingenting å gjøre
    if (this._currentBounds && this._currentBounds.contains(viewport)) {
      // Men forny preload hvis vi nærmer oss kanten? Enkelt: behold til vi går utenfor.
      return;
    }
    // Fase 1 igjen: rask viewport-last
    this._loadNext(false);
  },

  _padBounds(b: L.LatLngBounds, factor: number): L.LatLngBounds {
    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    const dLat = ((ne.lat - sw.lat) * factor) / 2;
    const dLng = ((ne.lng - sw.lng) * factor) / 2;
    return L.latLngBounds(
      L.latLng(sw.lat - dLat, sw.lng - dLng),
      L.latLng(ne.lat + dLat, ne.lng + dLng),
    );
  },

  _loadNext(padded: boolean) {
    const map = this._map as L.Map | undefined;
    if (!map) return;

    const reqId = ++this._reqId;
    const viewport = map.getBounds();
    const bounds = padded ? this._padBounds(viewport, PAD_FACTOR) : viewport;
    const size = map.getSize();

    // Pixel-størrelse: skaler opp ved padding så pikseltetthet bevares
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const padScale = padded ? 1 + PAD_FACTOR : 1;
    let w = Math.round(size.x * dpr * padScale);
    let h = Math.round(size.y * dpr * padScale);
    if (w > MAX_PIXELS || h > MAX_PIXELS) {
      const scale = MAX_PIXELS / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    const sw = L.CRS.EPSG3857.project(bounds.getSouthWest());
    const ne = L.CRS.EPSG3857.project(bounds.getNorthEast());

    const params = new URLSearchParams({
      bbox: `${sw.x},${sw.y},${ne.x},${ne.y}`,
      bboxSR: "3857",
      imageSR: "3857",
      size: `${w},${h}`,
      format: "png32",
      transparent: "true",
      f: "image",
    });
    const url = `${SERVICE_URL}?${params.toString()}`;

    if (this._pending) {
      map.removeLayer(this._pending);
      this._pending = null;
    }

    const next = L.imageOverlay(url, bounds, {
      opacity: this.options.opacity,
      pane: this.options.pane,
      interactive: false,
      attribution: this.options.attribution,
    });

    next.on("load", () => {
      if (reqId !== this._reqId) {
        map.removeLayer(next);
        return;
      }
      const old = this._current;
      this._current = next;
      this._currentBounds = bounds;
      this._pending = null;
      if (old) map.removeLayer(old);

      // Fase 2: planlegg padded preload etter en rask viewport-last
      if (!padded) {
        if (this._preloadTimer) clearTimeout(this._preloadTimer);
        this._preloadTimer = setTimeout(() => {
          // Bare preload hvis viewporten ikke har endret seg siden
          const m = this._map as L.Map | undefined;
          if (!m) return;
          const vp = m.getBounds();
          if (this._currentBounds && this._currentBounds.contains(vp)) {
            this._loadNext(true);
          }
        }, PRELOAD_DELAY_MS);
      }
    });

    next.on("error", () => {
      if (reqId === this._reqId) {
        this._pending = null;
      }
      map.removeLayer(next);
    });

    this._pending = next;
    next.addTo(map);
  },
}) as unknown as new (options?: any) => L.Layer;

export const createAvinorIcaoLayer = (options?: any): L.Layer =>
  new (AvinorIcaoLayer as any)(options);
