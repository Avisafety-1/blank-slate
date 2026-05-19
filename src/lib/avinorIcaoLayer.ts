import L from "leaflet";

/**
 * Avinor ICAO 1:500 000 VFR-flykart (dynamisk ArcGIS MapServer).
 * Henter en `export`-PNG som dekker hele kartutsnittet, og legger den som
 * en ImageOverlay. Oppdateres ved moveend. Ingen metadata-XHR, så
 * fungerer uten CORS (bilder lastes via <img>).
 */
const SERVICE_URL =
  "https://avigis.avinor.no/agsmap/rest/services/ICAO_500000_ExB/MapServer/export";

export const AvinorIcaoLayer = L.Layer.extend({
  options: {
    opacity: 1,
    attribution: "ICAO 1:500 000 © Avinor",
    pane: "tilePane",
    maxPixels: 2048,
  },

  onAdd(map: L.Map) {
    this._map = map;
    this._overlay = null;
    this._update();
    map.on("moveend zoomend", this._update, this);
    return this;
  },

  onRemove(map: L.Map) {
    if (this._overlay) {
      map.removeLayer(this._overlay);
      this._overlay = null;
    }
    map.off("moveend zoomend", this._update, this);
    return this;
  },

  setOpacity(opacity: number) {
    this.options.opacity = opacity;
    if (this._overlay) this._overlay.setOpacity(opacity);
    return this;
  },

  getAttribution() {
    return this.options.attribution;
  },

  _update() {
    const map = this._map as L.Map;
    if (!map) return;

    const bounds = map.getBounds();
    const size = map.getSize();

    // Begrens bildet til maxPixels for å redusere serverbelastning
    const maxPx = (this.options as any).maxPixels as number;
    let w = size.x;
    let h = size.y;
    if (w > maxPx || h > maxPx) {
      const scale = maxPx / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    // Konverter bounds til Web Mercator (EPSG:3857)
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

    if (this._overlay) {
      map.removeLayer(this._overlay);
    }

    this._overlay = L.imageOverlay(url, bounds, {
      opacity: this.options.opacity,
      pane: this.options.pane,
      interactive: false,
      attribution: this.options.attribution,
    }).addTo(map);
  },
}) as unknown as new (options?: any) => L.Layer;

export const createAvinorIcaoLayer = (options?: any): L.Layer =>
  new (AvinorIcaoLayer as any)(options);
