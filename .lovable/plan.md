
## Plan: Automatisk synk av nye dronesone-lag fra dronesoner.no

Henter 5 nye lag fra Luftfartstilsynets dronesoner.no daglig. Skjult som default, inngår i SORA-sikkerhetsanalyse.

### 1. Database (migrasjon)

Ny tabell `caa_drone_zones`:
- `layer_id` (tekst: 'fengsler', 'ambassader', 'fareomrader', 'flyplasser', 'notam_soner')
- `external_id`, `name`, `restriction`, `reason` (tekst[]), `message`
- `authority_name`, `authority_url`, `authority_phone`
- `lower_limit_m`, `upper_limit_m`, `lower_ref`, `upper_ref` (AGL/AMSL)
- `geometry` (geography MultiPolygon) + GIST-indeks
- `last_synced_at`
- RLS: authenticated read

Ny RPC `bulk_upsert_caa_zones(p_layer_id, p_features jsonb)` — upsert per `(layer_id, external_id)` og slett rader som mangler i ny batch.

### 2. Edge function `sync-caa-drone-zones`

- Beskyttet av `requireCronOrSuperadmin`
- Henter de 5 GeoJSON-filene fra `https://dronesoner.no/data/{forbud_fengsler,forbud_ambassader,obs_fareomrader,obs_flyplasser,obs_notam_soner}.geojson?v=<ts>`
- Normaliserer features → bulk-upsert via ny RPC
- Returnerer per-lag-statistikk

### 3. pg_cron-jobb

Daglig 04:00 UTC kaller `sync-caa-drone-zones` (samme mønster som `sync-geo-layers`).

### 4. Frontend (`OpenAIPMap.tsx` + `MapLayerControl`)

- Henter `caa_drone_zones` filtrert på viewport (bbox-query via PostGIS)
- 5 nye toggles i lag-panelet, **alle skjult som default**
- Farge: rød ved `restriction='REQ_AUTHORISATION'`, gul ved `CONDITIONAL`
- Popup viser navn, `message`, myndighet (klikkbar tlf/URL), høydegrenser

### 5. SORA-sikkerhetsanalyse

Utvid `safetyAnalysis` (`src/lib/`-funksjon brukt av route planner) til å sjekke rute-intersect mot `caa_drone_zones` per lag:
- Fengsler/ambassader/NSM-sensorforbud → **rød** advarsel (krever tillatelse)
- Fareomrader/små flyplasser/notam-soner → **gul** advarsel (vær oppmerksom)
- Bruker GIST-indeks for raske ST_Intersects-spørringer på bufferet rute

### Tekniske detaljer

- Total nedlasting ~1,3 MB/dag for de 5 lagene
- Estimert ~2000 nye geometrier
- Ingen overlapp med eksisterende tabeller (`rpas_*`, `nsm_*`, `vern_*`)
- Manuell trigger tilgjengelig for superadmin via Admin-siden (legges til som knapp ved siden av eksisterende sync-knapper)

### Filer som endres/opprettes

```text
ny  supabase/functions/sync-caa-drone-zones/index.ts
ny  migrasjon: caa_drone_zones + bulk_upsert_caa_zones + pg_cron-jobb
mod src/components/OpenAIPMap.tsx       (rendering + henting)
mod src/components/MapLayerControl.tsx  (legger til toggles)
mod src/lib/<safetyAnalysis>.ts         (utvid sjekk)
mod src/pages/Admin.tsx                 (manuell sync-knapp)
```
