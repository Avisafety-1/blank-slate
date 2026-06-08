# Plan: Zoom-plassering + 3D-kart videreutvikling

## Del 1 — Umiddelbart: Flytt zoom-kontrollen

I `OpenAIPMap.tsx` (linje 614–617) skyves Leaflet sin zoom-kontroll i dag 210 px ned fra toppen — den var beregnet for 4 knapper (vær, base, kartlag, rute). Nå har vi 5 knapper i stacken (vær, base, **3D**, kartlag, rute), så zoom havner oppå rute-knappen.

**Endring:** Øk `marginTop` fra `210px` til `260px` slik at +/- knappene legger seg rett under rute-knappen med samme 8 px luft som mellom de andre knappene.

Beregning: top-4 (16) + 5 × 40 (knapper) + 4 × 8 (gap) = 248 → ~260 px med litt buffer.

---

## Del 2 — 3D-kart roadmap

Mål: 3D-kartet skal være en likeverdig visning til 2D-kartet, der alle eksisterende funksjoner (vær, kartlag-toggles, ruteplanlegger) fungerer. Vi gjør dette i små, verifiserbare steg.

### Steg A — Stabilt 3D-grunnlag (delvis ferdig)
- OSM raster + AWS Terrarium DEM terreng + hillshade + pitch 60° ✅
- Navigation- og Terrain-kontroll ✅
- **Gjenstår:** Bytt-base-knapp (OSM ↔ satellitt ↔ topo) som speiler 2D-kartet, slik at brukeren kan velge underlag også i 3D.

### Steg B — Geosoner og statiske lag (les-modus)
Mål: vise samme lag som 2D, styrt av samme Kartlag-meny.

1. **Felles laghåndtering:** Løft `layers` state og `handleLayerToggle` ut av `OpenAIPMap` og opp i `Kart.tsx`. Send som props både til 2D- og 3D-kartet.
2. **Vektor-render i MapLibre:** Hver kategori legges som GeoJSON-source + fill/line-layer i Map3D:
   - OpenAIP luftrom (CTR/TIZ/TMA/R/P/D, RMZ/TMZ/ATZ) — samme farger/policy som 2D
   - NOTAM (RSS, 25 NM render-grense)
   - Naturvernområder (grønn/rød)
   - Kraftlinjer (NVE)
   - CAA dronesoner (NO) + DK dronesoner
   - SafeSky trafikk (live punkter)
3. **Viewport-fetch:** Gjenbruk eksisterende endepunkt-logikk — abonner på `moveend` i MapLibre og kall samme henteressurser.
4. **Klikk-popups:** MapLibre `queryRenderedFeatures` + felles popup-formatter delt med 2D.

### Steg C — Objekter (oppdrag, droner, piloter)
1. **Oppdrag/ruter:** Render `missions.route` som LineString-lag med samme farger som 2D. Klikk åpner samme `MissionDetailDialog`.
2. **Fullførte ruter:** `flight_logs.flight_track` som annet lag (planlagt vs faktisk skille).
3. **Live UAV-posisjoner:** DroneTag / FlightHub2-posisjoner som animerte punkt-marker, høyde fra `altitude_m` (ekte 3D-plassering over terreng).
4. **Pilotposisjon + VLOS/ALOS-radius:** Sirkel-polygon på bakken med høyde-ekstrusjon.

### Steg D — Værvisning
- Gjenbruk MET Norway-endepunkt. Klikk i kartet → samme `weather` popup-komponent som 2D.
- Vurder å droppe live tile-overlay i 3D (komplekst med terreng); behold punkt-basert vær først.

### Steg E — Ruteplanlegger i 3D
- Egen modus aktivert via samme 2D/3D-toggle + ruteplanlegger-knapp.
- MapLibre klikk-handler bygger samme `RoutePoint[]` struktur, slik at `handleRouteChange` i `Kart.tsx` ikke endres.
- Tegn rute som ekstrudert LineString med valgt høyde (visuell høyde-feedback i 3D er hovedgevinsten).
- SORA buffer-geometrier (blå/gul/rød) som transparente fill-extrusion-lag.

### Steg F — 3D-bygninger (valgfritt, krever vektor-kilde)
- OSM-buildings vektor-tiles (gratis: `https://data.osmbuildings.org/0.2/...` eller egen MapTiler-key hvis ønsket).
- Fill-extrusion basert på `height`/`render_height`.
- Skjules under zoom 14 for ytelse.

### Steg G — Polering
- Lagre 3D-state (pitch/bearing/zoom) i URL eller localStorage.
- Performance: cluster store punktmengder, deaktiver lag under viss zoom.
- Tilgjengelighet: tastatur-snarvei for å gå tilbake til 2D (Esc?).

---

## Tekniske notater

- **Felles datalag:** All henting (luftrom, NOTAM, natur, kraft, CAA/DK, oppdrag, vær) bør flyttes til delte hooks (`useAirspaceLayers`, `useMissionsLayer`, osv.) som både `OpenAIPMap` (Leaflet) og `Map3D` (MapLibre) kan abonnere på. Dette unngår dobbeltimplementasjon og garanterer paritet.
- **Render-adaptere:** Hver hook returnerer rå GeoJSON. Tynne adaptere konverterer til Leaflet-laggrupper eller MapLibre-sources/-layers.
- **Z-index/pane-policy:** Eksisterende 2D-policy (vær pointer-events:none, kraft i powerPane z-index 692, osv.) gjelder ikke i MapLibre — der bruker vi `layer order` i style-objektet. Etablere fast rekkefølge: terreng → hillshade → base → natur → kraft → luftrom → NOTAM → oppdrag → trafikk → pilot/UAV.
- **State-løft:** Kartlag-konfigurasjon må ut av `OpenAIPMap` for å kunne deles. Dette er den eneste refaktoreringen som krever endring i 2D-koden — alt annet kan gjøres uten å røre 2D.

## Rekkefølge på implementering

1. Del 1 (zoom-plassering) — 1 endring i `OpenAIPMap.tsx`
2. Steg A (base-toggle i 3D) — kun `Map3D.tsx`
3. Steg B trinn 1 (løft `layers` state) — refaktor uten visuell endring
4. Steg B trinn 2–4 (vektor-lag for geosoner) — én lag-gruppe om gangen
5. Steg C (oppdrag/objekter)
6. Steg D (vær)
7. Steg E (ruteplanlegger i 3D)
8. Steg F + G (bygninger og polering)

Bekrefter du Del 1 + at vi følger rekkefølgen over, så starter jeg med zoom-fix og Steg A når vi går til build mode.
