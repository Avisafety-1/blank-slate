
## Bakgrunn (verifisert)

1. **DK innerste ring rundt flyplasser** kommer fra `dk_drone_zones` "rod" (farve=1 = 5 km-sonene rundt flyvepladser). I `OpenAIPMap.tsx` er `dkRodLayer` feilaktig wiret til togglen **"Restriksjonsområder"** (`restriksjonsomrader`), mens den semantisk hører hjemme under **"RPAS 5 km"** (som er togglet på by default, akkurat som i Norge). Derfor må du i dag skru på "Restricted areas" for å se dem.
   - Sync-mapping (`sync-dk-drone-zones/index.ts`) plasserer allerede rød farve som `layer_id='rpas'` i unified-tabellen (243 rader), men det legacy Leaflet-laget ble hektet feil.
2. **Eurostat "Population" vises ikke.** Verifisert med direkte WMS-kall:
   - `srs=EPSG:3857` → `ServiceException: no image returned from source WMS` (GISCO GeoServer proxy støtter kun EPSG:3035/EPSG:4326).
   - `srs=EPSG:4326` → returnerer PNG korrekt.
   Kartet kjører EPSG:3857 (linje 120), og `L.tileLayer.wms` arver kartets CRS. Vi må tvinge `crs: L.CRS.EPSG4326` på `eurostatPopLayer` slik at Leaflet ber om 4326-bbox.
3. **Blå "?!"-bokser under danger areas**: ikke bekreftet årsak. De rendres ikke av vår kode (grep etter `?!` og alle divIcon/marker-generatorer viser ingen matcher). De kommer med all sannsynlighet fra OpenAIP sitt eget airspace-raster (`api.tiles.openaip.net/.../airspace/...png`) som viser reporting points / navnløse features. Må bekreftes ved å slå av OpenAIP airspace-tile før konklusjon — først da vet vi om vi kan filtrere dem lokalt eller om det må løses ved å bytte til vektortiles/skjule OpenAIP-tile i DK.

## Endringer

### 1. Flytt DK "rod" fra Restriksjonsområder → RPAS 5 km
`src/components/OpenAIPMap.tsx`:
- Fjern `dkRodLayer` fra `restriksjonsomrader`-configen (linje 1063).
- Legg `dkRodLayer` inn i `rpas`-configen (linje 1057) sammen med `rpasLayer` og `unifiedRpasLayer`.
- Behold `dkDroneLayerMap['rod' → dkRodLayer]` (fetch-logikken er lag-agnostisk), men `layeradd`/`layerremove`-listenerne trigger fortsatt refetch riktig siden de matcher på selve `L.LayerGroup`-referansen.

Effekt: DK 5 km-ringene rundt flyplasser blir synlige uten at brukeren må skru på "Restriksjonsområder" — samme oppførsel som Norge (`rpas`-toggle av default på).

### 2. Fiks Eurostat WMS-CRS
`src/components/OpenAIPMap.tsx` (linje 989–993):
- Legg til `crs: L.CRS.EPSG4326` og `uppercase: true` i `L.tileLayer.wms(...)`-opsjonene for `eurostatPopLayer`.
- Behold `version: "1.1.1"`, `styles: ""`.
- Ingen andre WMS-lag endres (SSB kjører fortsatt på 3857).

Effekt: Population-laget rendrer over hele Europa (utenfor Norge) når `befolkning` er aktivert.

### 3. Undersøk "?!"-ikoner
Ingen kodeendring i denne runden — planen inneholder verifiseringssteg:
- Slå av OpenAIP airspace-tilen midlertidig lokalt og bekreft at "?!"-boksene forsvinner. Hvis ja: dette er OpenAIPs egen tile-renderer for reporting points / unnamed airspace-features, og vi kan ikke filtrere per feature uten å bytte til vektortile. Da må vi enten (a) skjule OpenAIP-tile utenfor Norge, (b) redusere opacity, eller (c) bytte til OpenAIPs vektor-API. Beslutning tas i egen tur når vi vet årsaken.

## Ikke berørt

- Norsk RPAS/Restriksjons-visning (Geonorge WMS + `caaRestriksjonerLayer` uendret).
- Unified pipeline gating (fortsatt kun Moderavdeling).
- SSB/befolkning i Norge.
- Andre lands mapping (SE/DE/FI).
