## Datakilde (verifisert)

**Eurostat GISCO `PopulationGrid2021`** — EU census 2021, 1 km² grid, dekker hele Europa.

- WMS: `https://gisco-services.ec.europa.eu/maps/service`
- Layer: `PopulationGrid2021`
- Testet live: returnerer `image/png` (HTTP 200), `Access-Control-Allow-Origin: *`, dekker `EPSG:3857` globalt.
- Lisens: © European Commission, fri bruk med attribusjon.

Dette er den offisielle EU-pendanten til SSB sitt befolkningsrutenett og dekker akkurat det behovet du opprinnelig pekte på.

## Endringer

### `src/components/OpenAIPMap.tsx`
- Erstatt min nåværende (ikke-fungerende) `jrcGhsPopLayer` med et Eurostat WMS-lag.
- Beholder den samlede `befolkningstetthet`-togglen som inneholder begge:
  - `ssbBefolkningLayer` (SSB 1 km, dekker Norge, tegnes øverst).
  - `eurostatPopLayer` (Eurostat PopulationGrid2021, dekker resten av Europa).
- WMS-parametre:
  ```
  layers: "PopulationGrid2021"
  format: "image/png", transparent: true, version: "1.3.0"
  opacity: 0.6
  minZoom: 4, maxZoom: 14, tiled: true
  updateWhenIdle: true, keepBuffer: 1
  attribution: "© European Commission – Eurostat (GISCO)"
  ```
- Bruker eksisterende `populationDensityPane` (z-index 635).

Smart rendering kommer "gratis" fra WMS tile-mekanismen i Leaflet: kun tiles for synlig viewport hentes, og `minZoom: 4` hindrer at hele kloden lastes ved utzoom.

### `src/components/BefolkningLegend.tsx`
- Oppdater attribusjons-/kildelinjen til: "Norge: SSB · Europa: Eurostat GISCO (Census 2021)".

## Filer som endres
- `src/components/OpenAIPMap.tsx`
- `src/components/BefolkningLegend.tsx`

## Out of scope
- Ingen edge function, ingen storage-opplasting, ingen ny dependency.
- SORA/risiko-beregninger og SSB edge function rører jeg ikke.
- Klikk-popup på Eurostat-rutene utelates nå (kan legges til via WMS `GetFeatureInfo` senere hvis ønsket).
