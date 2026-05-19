import L from "leaflet";

/**
 * Avinor ICAO 1:500 000 VFR-flykart via ArcGIS export.
 *
 * Viktig: tjenesten er et dynamisk raster i Lambert-projeksjon, ikke en ekte
 * WebMercator tile-cache. Derfor bruker vi cachede, store image overlays i
 * stedet for å splitte den i tiles — tiles kan gi bare footprint/linjer og
 * manglende rasterfarger på enkelte zoom/områder.
 *
 * Treffer Avinor direkte fra nettleseren; belaster ikke vår backend/database.
 */
const SERVICE_URL =
  "https://avigis.avinor.no/agsmap/rest/services/ICAO_500000_ExB/MapServer/export";

const PAD_FACTOR = 1.0;
const PRELOAD_DELAY_MS = 250;
const MAX_IMAGE_PX = 4096;
const MAX_CACHE_IMAGES = 8;

type CachedOverlay = {
  id: string;
  bounds: L.LatLngBounds;
  overlay: L.ImageOverlay;
  zoom: number;
  lastUsed: number;
};

export const AvinorIcaoLayer = L.Layer.extend({
  options: {
    opacity: 1,
    attribution: "ICAO 1:500 000 © Avinor",
    pane: "tilePane",
  },

  onAdd(map: L.Map) {
    this._map = map;
    this._cache = [];
    this._pendingImages = new Set<HTMLImageElement>();
    this._requestId = 0;
    this._loadForViewport(false);
    this._schedulePaddedLoad = () => this._loadForViewport(true);
    this._onMoveEnd = () => this._scheduleLoad();
    map.on("moveend zoomend", this._onMoveEnd, this);
  },

  onRemove(map: L.Map) {
    if (this._timer) window.clearTimeout(this._timer);
    if (this._preloadTimer) window.clearTimeout(this._preloadTimer);
    map.off("moveend zoomend", this._onMoveEnd, this);
    (this._cache as CachedOverlay[] | undefined)?.forEach((entry) => {
      map.removeLayer(entry.overlay);
    });
    (this._pendingImages as Set<HTMLImageElement> | undefined)?.clear();
    this._cache = [];
  },

  _scheduleLoad() {
    if (this._timer) window.clearTimeout(this._timer);
    this._timer = window.setTimeout(() => this._loadForViewport(false), 80);
  },

  _loadForViewport(padded: boolean) {
    const map = this._map as L.Map | undefined;
    if (!map) return;

    const viewportBounds = map.getBounds();
    const zoom = Math.round(map.getZoom());
    const cached = this._findCoveringOverlay(viewportBounds, zoom);
    if (cached) {
      cached.lastUsed = Date.now();
      cached.overlay.bringToFront();
      if (!padded) this._queuePaddedPreload();
      return;
    }

    const bounds = padded ? this._padBounds(viewportBounds) : viewportBounds;
    this._loadOverlay(bounds, zoom, padded);
    if (!padded) this._queuePaddedPreload();
  },

  _queuePaddedPreload() {
    if (this._preloadTimer) window.clearTimeout(this._preloadTimer);
    this._preloadTimer = window.setTimeout(
      () => this._loadForViewport(true),
      PRELOAD_DELAY_MS,
    );
  },

  _findCoveringOverlay(bounds: L.LatLngBounds, zoom: number): CachedOverlay | null {
    const cache = (this._cache || []) as CachedOverlay[];
    return (
      cache.find(
        (entry) =>
          Math.abs(entry.zoom - zoom) <= 1 && entry.bounds.contains(bounds),
      ) || null
    );
  },

  _padBounds(bounds: L.LatLngBounds): L.LatLngBounds {
    const southWest = bounds.getSouthWest();
    const northEast = bounds.getNorthEast();
    const latPad = Math.max(0.05, (northEast.lat - southWest.lat) * PAD_FACTOR);
    const lngPad = Math.max(0.05, (northEast.lng - southWest.lng) * PAD_FACTOR);

    return L.latLngBounds(
      L.latLng(Math.max(-85, southWest.lat - latPad), Math.max(-180, southWest.lng - lngPad)),
      L.latLng(Math.min(85, northEast.lat + latPad), Math.min(180, northEast.lng + lngPad)),
    );
  },

  _loadOverlay(bounds: L.LatLngBounds, zoom: number, padded: boolean) {
    const map = this._map as L.Map | undefined;
    if (!map) return;

    const id = this._cacheKey(bounds, zoom);
    if ((this._cache as CachedOverlay[]).some((entry) => entry.id === id)) return;

    const requestId = ++this._requestId;
    const url = this._buildExportUrl(bounds, padded);
    const img = new Image();
    (this._pendingImages as Set<HTMLImageElement>).add(img);
    img.onload = () => {
      (this._pendingImages as Set<HTMLImageElement>).delete(img);
      if (!this._map || requestId < this._requestId - 2) return;
      const overlay = L.imageOverlay(url, bounds, {
        opacity: this.options.opacity,
        pane: this.options.pane,
        attribution: this.options.attribution,
        interactive: false,
      });
      overlay.addTo(map).bringToFront();
      (this._cache as CachedOverlay[]).push({
        id,
        bounds,
        overlay,
        zoom,
        lastUsed: Date.now(),
      });
      this._pruneCache();
    };
    img.onerror = () => {
      (this._pendingImages as Set<HTMLImageElement>).delete(img);
    };
    img.src = url;
  },

  _buildExportUrl(bounds: L.LatLngBounds, padded: boolean): string {
    const sw = L.CRS.EPSG3857.project(bounds.getSouthWest());
    const ne = L.CRS.EPSG3857.project(bounds.getNorthEast());
    const mapSize = (this._map as L.Map).getSize();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = padded ? 3 : 1;
    const rawWidth = mapSize.x * dpr * scale;
    const rawHeight = mapSize.y * dpr * scale;
    const maxScale = Math.min(1, MAX_IMAGE_PX / Math.max(rawWidth, rawHeight));
    const width = Math.ceil(rawWidth * maxScale);
    const height = Math.ceil(rawHeight * maxScale);

    const params = new URLSearchParams({
      bbox: `${sw.x},${sw.y},${ne.x},${ne.y}`,
      bboxSR: "3857",
      imageSR: "3857",
      layers: "show:3",
      size: `${width},${height}`,
      format: "png32",
      transparent: "false",
      f: "image",
    });

    return `${SERVICE_URL}?${params.toString()}`;
  },

  _cacheKey(bounds: L.LatLngBounds, zoom: number): string {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    return [zoom, sw.lat, sw.lng, ne.lat, ne.lng]
      .map((value) => Number(value).toFixed(3))
      .join(":");
  },

  _pruneCache() {
    const map = this._map as L.Map | undefined;
    const cache = this._cache as CachedOverlay[];
    if (!map || cache.length <= MAX_CACHE_IMAGES) return;

    cache
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .splice(MAX_CACHE_IMAGES)
      .forEach((entry) => map.removeLayer(entry.overlay));
    this._cache = cache.slice(0, MAX_CACHE_IMAGES);
  },
}) as unknown as new (options?: any) => L.Layer;

export const createAvinorIcaoLayer = (options?: any): L.Layer =>
  new (AvinorIcaoLayer as any)(options);