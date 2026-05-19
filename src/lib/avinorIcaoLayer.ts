import L from "leaflet";

/**
 * Avinor ICAO 1:500 000 VFR-flykart (dynamisk ArcGIS MapServer).
 *
 * - Henter en `export`-PNG som dekker hele kartutsnittet.
 * - Bruker devicePixelRatio for skarphet på retina-skjermer.
 * - Double-buffering: nytt bilde lastes i bakgrunnen, gammelt fjernes
 *   først når nytt er ferdig — eliminerer hvitt blink ved panorering.
 * - Debouncer moveend (150 ms) for å spare requests under hurtig pan/zoom.
 * - Ingen metadata-XHR, så fungerer uten CORS (bilder lastes via <img>).
 * - Treffer Avinor direkte; belaster ikke vår backend.
 */
const SERVICE_URL =
  "https://avigis.avinor.no/agsmap/rest/services/ICAO_500000_ExB/MapServer/export";

const DEBOUNCE_MS = 150;
const MAX_PIXELS = 3000;
const MAX_DPR = 2;

export const AvinorIcaoLayer = L.Layer.extend({
  options: {
    opacity: 1,
    attribution: "ICAO 1:500 000 © Avinor",
    pane: "tilePane",
  },

  onAdd(map: L.Map) {
    this._map = map;
    this._current = null as L.ImageOverlay | null;
    this._pending = null as L.ImageOverlay | null;
    this._reqId = 0;
    this._debounceTimer = null as ReturnType<typeof setTimeout> | null;

    this._scheduleUpdate = () => {
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => this._loadNext(), DEBOUNCE_MS);
    };

    this._loadNext();
    map.on("moveend zoomend", this._scheduleUpdate, this);
    return this;
  },

  onRemove(map: L.Map) {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    if (this._current) {
      map.removeLayer(this._current);
      this._current = null;
    }
    if (this._pending) {
      map.removeLayer(this._pending);
      this._pending = null;
    }
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

  _loadNext() {
    const map = this._map as L.Map | undefined;
    if (!map) return;

    const reqId = ++this._reqId;
    const bounds = map.getBounds();
    const size = map.getSize();

    // Bruk devicePixelRatio (capped) for skarphet på retina
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    let w = Math.round(size.x * dpr);
    let h = Math.round(size.y * dpr);
    if (w > MAX_PIXELS || h > MAX_PIXELS) {
      const scale = MAX_PIXELS / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    // bounds → Web Mercator (EPSG:3857)
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

    // Fjern eventuelt foreldet pending (eldre enn denne)
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
        // En nyere request har kommet — kast denne
        map.removeLayer(next);
        return;
      }
      const old = this._current;
      this._current = next;
      this._pending = null;
      if (old) map.removeLayer(old);
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
