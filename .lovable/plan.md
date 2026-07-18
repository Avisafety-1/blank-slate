## Mål
Legg til svenske verneområder fra Naturvårdsverket i unified airspace-modellen, kun aktivt for Moderavdeling (allowlist), uten å påvirke norsk flow eller andre brukere.

## Datakilde
- **WFS**: `https://geodata.naturvardsverket.se/naturvardsregistret/wfs`
- Lag som hentes:
  - Naturreservat
  - Nationalparker
  - Naturvårdsområden
  - Biotopskydd
  - Djur- och växtskyddsområden
  - Natura 2000 (SCI + SPA)

## Endringer

### 1. Ny edge function `sync-sweden-nature`
Under `supabase/functions/sync-sweden-nature/index.ts`:
- Henter hvert lag via WFS `GetFeature` som GeoJSON (`outputFormat=application/json`, `srsName=EPSG:4326`).
- Tiled bbox-strategi (lik tysk adapter) for å unngå timeout — Sverige delt i ~1° ruter.
- Mapper hver feature til `airspace_zones`-rad:
  - `country = 'SE'`
  - `source = 'naturvardsverket'`
  - `layer_id` per verneform: `se_naturreservat`, `se_nationalpark`, `se_naturvardsomrade`, `se_biotopskydd`, `se_djurskydd`, `se_natura2000`
  - `zone_type = 'protected_area'` (ny kategori) eller `nature` for å matche eksisterende semantikk
  - `name`, `identifier` (NVR-id), `properties` (rå-attributter)
- Idempotent upsert med `(source, external_id)` som konfliktnøkkel.
- Deduplication mot ID-kollisjoner (samme lærdom som DK-fasen).

### 2. Registrer function i `supabase/config.toml`
`verify_jwt = false`, invoke fra admin manuelt eller via cron senere.

### 3. Kjør backfill
Én invocation per lag, tiled. Rapporter antall zoner per lag.

### 4. UI-wiring i `src/lib/unifiedRouteProximityLayers.ts` og `src/components/OpenAIPMap.tsx`
- Utvid `fetchUnifiedNatureInBounds` (eller tilsvarende) til å inkludere SE-lag i tillegg til DK.
- Vis polygonene på samme naturvern-lag-knapp som allerede eksisterer (grønn styling per verneform, konsistent med norsk `NATURVERN_COLORS`).
- Auto-reveal langs rute i tillegg til manuell aktivering.
- Popup viser navn + verneform + auto-badge når trigget av rute.

### 5. Route proximity + safety analysis
- `airspace_zones_intersecting_route` RPC dekker allerede alle rader i `airspace_zones`, så svenske verneområder kommer automatisk med i luftromssjekk for Moderavdeling når de er lagret der.
- Bekreft at `zone_type` filtreringen ikke ekskluderer verneområder (juster om nødvendig).

## Ikke i scope
- Ingen endringer i norsk `naturvern_zones`/`vern_restriction_zones`-flow.
- Ingen aktivering utenfor Moderavdeling-allowlisten.
- Ikke Tyskland/Finland verneområder i denne runden (kan følge samme mønster senere via Natura2000 nasjonale kilder).

## Verifisering
- Etter backfill: `select layer_id, count(*) from airspace_zones where country='SE' and source='naturvardsverket' group by layer_id`.
- Tegn rute i Sverige som logget-inn Moderavdeling-bruker → verneområder skal dukke opp både manuelt (lag på) og automatisk (rute-buffer).
- Logget-inn norsk bruker: ingen synlig endring.
