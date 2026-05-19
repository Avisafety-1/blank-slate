import L from "leaflet";

/**
 * Avinor ICAO 1:500 000 VFR-flykart som ekte tile-lag.
 *
 * Bruker Leafletet sitt innebygde GridLayer-system: hver tile er en 512×512 PNG
 * fra ArcGIS `export`-endpoint med tile-bbox i EPSG:3857. Leaflet:
 *  - cacher tiles automatisk (panorering viser øyeblikkelig allerede-lastede tiles)
 *  - beholder forrige zoomnivå mens nytt lastes (ingen blink)
 *  - dropper bare tiles utenfor `keepBuffer`
 *
 * Treffer Avinor direkte; belaster ikke vår backend.
 */
const SERVICE_URL =
  "https://avigis.avinor.no/agsmap/rest/services/ICAO_500000_ExB/MapServer/export";

const TILE_SIZE = 512;

export const AvinorIcaoLayer = L.GridLayer.extend({
  options: {
    tileSize: TILE_SIZE,
    opacity: 1,
    attribution: "ICAO 1:500 000 © Avinor",
    pane: "tilePane",
    // Hold mange tiles i cache for å unngå reload ved zoom ut
    keepBuffer: 8,
    updateWhenZooming: false,
    updateWhenIdle: true,
    crossOrigin: true,
  },

  createTile(coords: L.Coords, done: (err: Error | null, tile: HTMLElement) => void) {
    const tile = document.createElement("img");
    tile.setAttribute("role", "presentation");
    tile.alt = "";
    (tile as any).crossOrigin = "";

    // Tile-bounds i Web Mercator
    const map = this._map as L.Map;
    const nwPoint = coords.scaleBy(L.point(TILE_SIZE, TILE_SIZE));
    const sePoint = nwPoint.add(L.point(TILE_SIZE, TILE_SIZE));
    const nw = map.unproject(nwPoint, coords.z);
    const se = map.unproject(sePoint, coords.z);
    const swMerc = L.CRS.EPSG3857.project(L.latLng(se.lat, nw.lng));
    const neMerc = L.CRS.EPSG3857.project(L.latLng(nw.lat, se.lng));

    // Be om dobbel pixel-tetthet for retina-skarphet
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(TILE_SIZE * dpr);

    const params = new URLSearchParams({
      bbox: `${swMerc.x},${swMerc.y},${neMerc.x},${neMerc.y}`,
      bboxSR: "3857",
      imageSR: "3857",
      size: `${px},${px}`,
      format: "png32",
      transparent: "true",
      f: "image",
    });

    tile.onload = () => done(null, tile);
    tile.onerror = () => done(new Error("tile load error"), tile);
    tile.src = `${SERVICE_URL}?${params.toString()}`;

    return tile;
  },
}) as unknown as new (options?: any) => L.GridLayer;

export const createAvinorIcaoLayer = (options?: any): L.GridLayer =>
  new (AvinorIcaoLayer as any)(options);
