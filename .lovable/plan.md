## Mål

Vise befolkningstetthet i hele Europa på `/kart` ved å bruke JRC GHS-POP (R2023A, 100 m / 1 km raster) som komplement til SSB-laget. I Norge fortsetter SSB å være kilden; utenfor Norge kommer dekningen fra JRC. Begge styres av ett felles toggle i kartlagsmenyen.

## Endringer i UI

I `src/components/OpenAIPMap.tsx`:

- Erstatt dagens `befolkning1km` (SSB-only) med ett samlet lag-id `befolkningstetthet`, navn **"Befolkningstetthet (SSB + JRC GHS-POP)"**, ikon `users`.
- Internt er laget en `L.LayerGroup` som inneholder to WMS-lag:
  1. SSB `befolkning_1km_2025` (eksisterende, dekker Norge).
  2. JRC GHS-POP WMS (dekker Europa/verden).
- Begge skrus av/på samtidig via samme checkbox. SSB tegnes på toppen (Norge får finere, lokal kilde), JRC under.
- Tegnforklaring (`BefolkningLegend`) oppdateres til å nevne begge kilder + attribusjon "© European Commission, JRC – GHSL" og "© SSB".

## Smart rendering

WMS-tile-layers i Leaflet henter kun tiles for synlig viewport + zoom, så last skaleres automatisk med kartutsnittet. I tillegg:

- Sett `minZoom: 4` på JRC-laget (under det blir hele Europa ett tileutsnitt og lite nyttig — unngår tunge globale requests).
- Sett `maxZoom: 12` med `maxNativeZoom: 10` (GHS-POP er 100 m raster; Leaflet oppskaler i stedet for å be om unødvendig høy oppløsning).
- `tiled: true`, `updateWhenIdle: true`, `keepBuffer: 1` for å redusere antall samtidige requests under panorering på mobil.
- `opacity: 0.55` slik at SSB-laget visuelt "vinner" over Norge der de overlapper.
- Bruker eksisterende `populationDensityPane` (z-index 635) for konsistent stacking.

Dette gir ingen ny edge-function — alt går direkte mot JRCs offentlige WMS. Vi gjør derfor ingen serverside-prosessering eller caching nå.

## Datakilde

JRC GHSL publiserer GHS-POP via offentlig WMS (OGC). Under implementering verifiseres det eksakte endepunktet (`https://ghsl.jrc.ec.europa.eu/...`) og lag-navnet (typisk `GHS_POP_E2025_GLOBE_R2023A_4326_3ss` eller 30ss-varianten for 1 km). Hvis JRCs WMS er ustabil/ratelimit-tung, faller vi tilbake til deres WMTS-tiles med samme dataset — samme UX, kun annen URL-mal.

Vi rører **ikke** SORA-/risiko-beregningene: `adjacentAreaCalculator` og `ssb-population` edge function brukes fortsatt som i dag innenfor Norge. Dette er rent visuelt kartlag.

## Filer som endres

- `src/components/OpenAIPMap.tsx` — bytt ut `befolkning1km`-laget med kombinert layerGroup.
- `src/components/BefolkningLegend.tsx` — oppdatert tekst/attribusjon for to kilder.

## Out of scope

- Ingen endringer i SORA-grunnrisiko, adjacent area, eller PDF-eksport.
- Ingen ny edge function eller DB-tabell.
- Ingen klikk-popup på JRC-rutene (kun visuell heat-overlay). Kan legges til senere hvis ønsket.
