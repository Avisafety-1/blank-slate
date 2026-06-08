## Mål

1. Når man bytter til 3D skal standard kartlag være **satelitt** (ikke OSM).
2. 3D-kartet skal åpne på samme posisjon og zoom som 2D-kartet (ikke hoppe til Oslo). Tilsvarende ved bytte tilbake til 2D.
3. Vis SafeSky-trafikk (lufttrafikk) i 3D, med samme popup som i 2D.

## Endringer

### 1) `src/components/Map3D.tsx` — Satelitt som default
- Endre initial `useState<BaseLayer>("osm")` → `useState<BaseLayer>("satellite")`.
- Endre `buildStyle("osm")` i `new maplibregl.Map({ style: ... })` → `buildStyle("satellite")`.
- Juster toggle-rekkefølgen i base-layer-knappen så den fortsatt sirkulerer satellite → topo → osm → satellite (eller behold dagens rekkefølge — bare default endres).

### 2) Delt viewport mellom 2D og 3D — `src/pages/Kart.tsx` + `OpenAIPMap.tsx` + `Map3D.tsx`
- I `Kart.tsx`: legg til `const [sharedView, setSharedView] = useState<{ center: [number, number]; zoom: number } | null>(null);`
- `OpenAIPMap.tsx`: legg til prop `onViewChange?: (center: [number, number], zoom: number) => void`. Inne i map-init: registrer `map.on("moveend", () => onViewChange?.([c.lat, c.lng], map.getZoom()))`. Send fra Kart.tsx.
- `Map3D.tsx`:
  - Aksepter `initialZoom` fra prop (allerede definert) og bruk `sharedView.zoom` hvis satt.
  - Legg til prop `onViewChange?: (center: [number, number], zoom: number) => void` og kall i `moveend`.
- I `Kart.tsx`-renderlogikken: send `initialCenter={sharedView?.center}` og `initialZoom={sharedView?.zoom}` til `Map3D`, og tilsvarende `initialCenter` til `OpenAIPMap` når man bytter tilbake. Begge komponenter sender `onViewChange={setSharedView}`.
- Resultat: bytte 2D ↔ 3D bevarer center+zoom uten å hoppe til Oslo.

### 3) SafeSky-trafikk i 3D — `src/components/Map3D.tsx`
- Hent beacons fra `safesky_beacons`-tabellen (samme datakilde som 2D bruker indirekte) med 10s polling — kun feltene som popup trenger: `id, latitude, longitude, altitude, course, beacon_type, callsign, aircraft_model, registration, ground_speed, vertical_speed, squawk, on_ground, source, last_update`.
- Bygg GeoJSON FeatureCollection med Point-features hvor `altitude` (m) brukes som koordinatens Z (3D-posisjon).
- Legg til kilde `safesky` og et `symbol`-lag som bruker eksisterende beacon-SVG (samme `getBeaconSvgUrl(beaconType)` som 2D) lastet via `map.loadImage` + `map.addImage` per beacon-type. Bruk `icon-rotate` = `course`, `icon-allow-overlap: true`.
- Behold ikonet flatt mot kameraet (`icon-pitch-alignment: viewport`) — standard MapLibre-oppførsel.
- Click-handler: bygg popup via eksisterende `renderTrafficPopup({...})` (samme HTML som 2D) og vis i `maplibregl.Popup`.
- Cleanup-intervaller og kilde i `useEffect`-return.
- Liten "Lufttrafikk"-toggle-knapp i kontroll-stacken (samme stil som 3D-bygg/airspace-knapper) for å skru av/på.

## Tekniske notater
- Ingen database-, RLS- eller migrasjonsendringer. Bruker eksisterende `safesky_beacons`-tabell og eksisterende `renderTrafficPopup`/`getBeaconSvgUrl`.
- SafeSky-ikonene er SVG (URL via `getBeaconSvgUrl`); MapLibre krever bitmap — last via `<img>` → `createImageBitmap` → `map.addImage(id, bitmap)` med ett kall per beacon-type ved første bruk.
- Beacon-høyde (Z i koordinaten) gir riktig vertikal plassering relativt til 3D-bygg og airspace-sylindre i pitched view.
- Heli-animasjon (frame-bytte i 2D) droppes i 3D for nå — statisk ikon med korrekt rotasjon.
- Viewport-callback throttles naturlig via `moveend` (kun ved slutt av bevegelse) — billig.
