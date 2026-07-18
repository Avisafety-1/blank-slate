
## Del 1 — Eurostat befolkningstetthet vises ikke

**Rotårsak (verifisert):** GISCO WMS krever `STYLES` (returnerer `ServiceException: missing parameters ['styles']` uten den). Leaflet's `TileLayer.WMS` sender normalt `STYLES=` automatisk, men når vi tvinger `crs: L.CRS.EPSG4326` inne i et EPSG:3857-kart bruker Leaflet 4326-tile-oppløsning (bare 2 tiles på zoom 0, forskjøvet grid) — så tiles havner utenfor synlig viewport. Direktekall til GISCO WMS med `STYLES=&SRS=EPSG:3857` fungerer også (ikke bare 4326).

**Fix:**
1. I `src/components/OpenAIPMap.tsx` (linje 988–994) fjerne `crs: L.CRS.EPSG4326` og `uppercase: true`, og eksplisitt sette `styles: ""` slik at Leaflet bruker kartets EPSG:3857 grid som forventet.
2. Verifisere at legenden (`BefolkningLegend`) fortsatt vises for Eurostat-modus i Tyskland.

## Del 2 — Kraftledninger, luftfartshindre osv. i DK/SE/DE/FI

**Verifiserte fakta om tilgjengelige kilder:**
- **OpenAIP** har `obstacles` (luftfartshindre) globalt via `api.core.openaip.net/api/obstacles` — enhetlig for hele Europa. Dette kan erstatte NRK/Kartverket-hindre for ikke-norske land.
- **OpenAIP har ikke** kraftledninger. Ingen offisiell paneuropeisk kilde finnes.
- **OpenStreetMap** (`power=line`, `power=minor_line`, `power=tower`) er den eneste realistiske paneuropeiske kilden for kraftledninger. Hentes via Overpass API per viewport, eller Wikimedia/OSM WMS `power` layer.
- Nasjonale nettselskaper (DK: Energinet, DE: 50Hertz/TenneT/Amprion/TransnetBW, FI: Fingrid) har egne datasett, men de er fragmenterte og krever N adaptere per land — ikke skalerbart.

**Anbefaling (skalerbar arkitektur, i tråd med unified airspace-mønsteret):**

### 2a. Luftfartshindre (obstacles)
- Ny edge function `openaip-obstacles-fetch` som proxier `api.core.openaip.net/api/obstacles?bbox=...&country=DE,DK,FI,SE` med server-side API-nøkkel.
- Ny map data-fetcher `fetchOpenAipObstacles(bbox)` som brukes for ikke-NO viewports.
- Merges inn i eksisterende `luftfartshindre`-knapp (samme mønster som unified airspace merges inn i eksisterende knapper).
- Kun aktiv for allowlisted selskaper (Moderavdeling) initielt — Norge bruker fortsatt Kartverket/NRK.

### 2b. Kraftledninger (power lines)
- Ny edge function `osm-power-lines-fetch` som spør Overpass API:
  `[out:json];(way["power"~"^(line|minor_line)$"](bbox);node["power"="tower"](bbox););out geom;`
- Cache viewport-resultater i Postgres tabell `osm_power_lines_cache` (bbox + geom + fetched_at, 30 dagers TTL).
- Ny fetcher `fetchOsmPowerLines(bbox)` — kun for zoom ≥ 11 (Overpass er tregt, må begrenses).
- Merges inn i eksisterende `kraftledninger`-knapp.
- Kun aktiv for allowlisted selskaper. Norge bruker fortsatt NVE.

### 2c. Ikke i denne runden
- Eiendomsgrenser: hvert EU-land har eget kadaster, ingen enhetlig kilde. Utsettes.
- Tettsteder/befolkning-polygoner: Eurostat GEOSTAT dekker allerede dette. Ingen endring nødvendig utover Del 1.
- Verneområder DE/SE/FI: Natura2000 dekker allerede DE (32k soner backfilled). SE/FI kan legges til senere via samme adapter-mønster.

## Rekkefølge og risiko

1. **Del 1 (Eurostat-fix)** — trygg, ren UI-fix, ingen skjema-endring.
2. **Del 2a (OpenAIP obstacles)** — trenger OpenAIP API-nøkkel som secret. Additivt, gated på allowlist.
3. **Del 2b (OSM power lines)** — trenger ny cache-tabell + Overpass rate-limit håndtering. Additivt, gated.

Ingen endring påvirker norske brukere eller andre selskaper enn Moderavdeling. Ingen eksisterende kartlag fjernes.

## Spørsmål før implementasjon

Skal jeg starte med bare **Del 1** (Eurostat-fix), eller kjøre hele **Del 1 + 2a + 2b** i samme runde? Del 2b krever at du legger til en OSM Overpass-strategi — det er ingen API-nøkkel, men vi bør avklare cache-tabellen.
