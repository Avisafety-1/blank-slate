## Mål
Fjern den "bølgete/trappete" effekten på FG (grønn) og Cont (gul) ved å bruke én jevn terreng-baseline per polygon i stedet for 3×3-gridets rå min/max. Behold farger og GRB-oppførsel.

## Endringer (kun `src/components/Map3D.tsx`)

### 1. Ny lokal helper i `Map3D.tsx`: `sampleSmoothedRingTerrain(geometry)`
- Henter ytre ring av Polygon / første ring av MultiPolygon.
- Sampler jevnt langs hele kanten:
  - `EDGE_SAMPLES_PER_100M = 12` (≈ ett punkt per ~8 m kant).
  - Minimum 40 samples per ring, maks 600 (cap).
- Kaller `fetchTerrainElevations` (én batch per ribbon-kall – kan flettes med eksisterende SORA-terrain-debounce).
- Glatter profilen med moving average:
  - `MOVING_AVG_WINDOW = 9` (sirkulært vindu siden ringen er lukket).
- Returnerer `{ smoothedMin, smoothedMax }` (avrundet til hele meter). Fallback `120` ved feil/tomme data, som før.
- Cache per polygon-nøkkel (zone_id eller geometri-hash) i et lokalt `Map` inne i `Map3D` (samme stil som `zoneTerrainSampler`-cachen, men separat siden vi nå sampler ringen, ikke bbox-grid).

### 2. Bruk smoothed-verdiene i SORA-debouncen (linje ~1289–1327)
Erstatt dagens `sampleZonesTerrain` for FG og Cont med `sampleSmoothedRingTerrain`. GRB beholdes på `sampleZonesTerrain` (eller droppes — brukes ikke til høyder uansett).

For hver av FG og Cont:
- `props.terrain_min_m = smoothedMin`
- `props.terrain_max_m = smoothedMax`
- **FG:** `render_base_m = smoothedMax`, `render_height_m = smoothedMax + flightAltitude`
- **Cont:** `render_base_m = smoothedMax`, `render_height_m = smoothedMax + 0.5 × flightAltitude`
- **GRB:** uendret (fill-lag, drapert på terreng).

Initial-rendring (før terreng er hentet) beholdes som i dag (base=0, height=AGL).

### 3. Lag-opacity / outline (kun små justeringer for å matche spec)
- `RP_LAYER_FG_FILL` opacity: **0.45** (uendret).
- `RP_LAYER_CONT_FILL` opacity: **0.40** (uendret).
- `RP_LAYER_GRB_FILL` opacity: **0.35** (uendret), `fill-outline-color: #b91c1c` (uendret).
- `RP_LAYER_FG_OUTLINE` line-opacity: 0.7 → **0.60**.
- `RP_LAYER_CONT_OUTLINE` line-opacity: 0.7 → **0.60**.

### 4. Ribbon
Uendret (forrige iterasjon). Bruker fortsatt sin egen terreng-sampling langs ruten.

## Ikke endre
- `RouteData`-modell, lagring, `soraGeometry.ts`, `zoneTerrainSampler.ts` API, 2D-`Kart.tsx`.
- Farger på FG/Cont/GRB.
- GRB-rendering (fortsatt drapert fill på bakken).

## Tekniske detaljer
- Sirkulært moving-average: `smoothed[i] = mean(profile[(i-4..i+4) mod N])`.
- Edge-sampling: gå gjennom ringen, kumuler kant-lengde i meter (haversine), plasser samples jevnt på total-lengden.
- Hopp over polygon hvis ring < 3 punkter.
- Hvis Open-Meteo returnerer < 50 % gyldige verdier → fallback til dagens 3×3 bbox-sample (eksisterende `sampleZonesTerrain` resultat) for å unngå tomme volumer.

## Verifikasjon
- Tegn en 3-punkts rute over kupert terreng (samme område som i screenshot).
- Sjekk at FG-toppen og Cont-toppen ligger flatt/jevnt over polygonet (ingen "bølger" langs kanten).
- Sjekk at FG ligger over høyeste terreng i polygonet (`smoothedMax`-baseline).
- GRB skal fortsatt ligge flatt på bakken.
