
## Mål
Vise danske dronezoner og naturområder fra Trafikstyrelsens API (`dronezoner.eu/API/`) i Avisafe-kartet, parallelt med eksisterende norske CAA-soner. Datasettet skal kunne brukes både i Norge og Danmark, og være klart når dere åpner for danske kunder.

## Anbefaling på spørsmålene

**1. Samme kartlag-knapp?** Ja — bruk den eksisterende `MapLayerControl`-sheet, men gruppér nye lag under en egen seksjon "🇩🇰 Danmark (Trafikstyrelsen)" så det er tydelig hva som er hva. Vi har allerede nordiske naturområder (`Nature Conservation`-memory) — dansk natur blir et eget lag ved siden av.

**2. Unngå at alt lastes samtidig?** Ja, samme mønster som CAA-sonene i dag:
- Lag **default av** (samme som norske P/R/D).
- **Viewport-fetch** via Postgres-RPC med GIST-indeks (bare zoner som overlapper kartets bbox returneres).
- **Zoom-gate** — punkt-lag (lufthavner/heliporte) vises kun zoom ≥ 9; polygon-lag fra zoom ≥ 7.
- **Debounce** på `moveend` (vi har det allerede).
- Synk fra Trafikstyrelsen kjører i `pg_cron` om natten — frontend treffer aldri ArcGIS-URLene direkte.

## Arkitektur

```text
pg_cron 04:00 CET ──▶ edge fn: sync-dk-drone-zones
                          │
                          ├─ GET GeoJSON dronezoner (1 fil, alle farger)
                          └─ GET GeoJSON naturområder (1 fil, aktiv/inaktiv)
                                   │
                                   ▼
                          UPSERT i dk_drone_zones + dk_nature_areas
                                   │
Frontend ◀── RPC get_dk_zones_in_bounds(bbox, layer_ids[]) ──┘
   │
   └─ MapLayerControl: 4 nye lag (Rød/Orange/Blå/Naturområder)
```

## Datamodell

**`dk_drone_zones`** (analogt med `caa_drone_zones`)
- `layer_id` text — `rod` | `orange` | `bla` | `point` (signaturer/lufthavner)
- `external_id` text (fra GeoJSON `properties.ObjectID` eller `FID`)
- `name`, `category`, `message`, `authority_name`, `authority_phone`
- `lower_limit_m`, `upper_limit_m`, `lower_ref`, `upper_ref`
- `geometry geometry(Geometry, 4326)` — GIST-indeks
- `properties jsonb` — rå GeoJSON-properties
- `last_synced_at`, `created_at`, `updated_at`

**`dk_nature_areas`**
- `external_id`, `name`, `status` (`Aktiv` / `Inaktiv`)
- `season_from`, `season_to` (text — for sesongmessige zoner)
- `geometry` + GIST-indeks, `properties jsonb`, timestamps

RLS: `SELECT` for `authenticated` (samme mønster som `caa_drone_zones`). Skriverettigheter kun via service role i edge function.

**RPC `get_dk_zones_in_bounds(min_lat, min_lng, max_lat, max_lng, p_layer_ids text[])`** — returnerer kun zoner i bbox, filtrert på lag.

## Edge function: `sync-dk-drone-zones`

- Daglig schedule via `pg_cron` kl. 04:00 UTC (etter Trafikstyrelsens 03:00 CET).
- Henter to GeoJSON-endpoints:
  - Dronezoner: `…/items/980697acd04d4a9bb1fd34bbefab924a/data`
  - Naturområder: `…/items/ff657943724944faaf19807380f5e24a/data`
- SSRF-safe via `safeFetch` med allow-list `["trafikstyrelsen.maps.arcgis.com"]` (mønster fra `_shared/http.ts`).
- Splitter features etter farve/type → `layer_id`.
- UPSERT på `external_id`, sletter rader som mangler i siste respons (utgåtte zoner).
- Logger antall features per lag til en `sync_log`-tabell.

## Frontend-endringer

1. **`mapDataFetchers.ts`** — ny `fetchDkDroneZones()` og `fetchDkNatureAreas()` (klone `fetchCaaDroneZones` med DK-styling: rød `#dc2626`, orange `#f97316`, blå `#2563eb`, grønn aktiv `#22c55e`, grå inaktiv).
2. **`MapLayerControl.tsx`** — støtt seksjons-headere så vi får visuell gruppering "Norge" / "Danmark". Mindre refactor — eksisterende `LayerConfig`-array får valgfri `group`-string.
3. **`OpenAIPMap.tsx`** (og `MissionMapPreview` hvis relevant) — registrer 4 nye lag default-av, koble til `fetchDkDroneZones` i viewport-handleren.
4. **i18n**: nye strenger for lag-navnene i `no.json` (Danmark blir et eget land).

## Safety analysis (planlagt fase 2 — IKKE inkludert nå)

Når dere åpner for danske kunder må `safety-analysis`-edge funksjonen utvides til å sjekke ruter mot `dk_drone_zones` på samme måte som NSM/RPAS i Norge. Holdes utenfor denne PR-en for å holde scopet rent — flagges som oppfølging.

## Leveranse

- 1 migration: 2 tabeller + GIST + RLS + RPC + cron-schedule
- 1 ny edge function `sync-dk-drone-zones`
- 3 frontend-filer (`mapDataFetchers`, `MapLayerControl`, `OpenAIPMap`)
- 1 memory-oppdatering: `mem://integrations/dk-trafikstyrelsen-sync`

## Spørsmål før implementasjon
1. Skal naturområder vise **inaktive** zoner også (grå), eller bare aktive? Trafikstyrelsen leverer begge.
2. Vil dere ha alt synlig fra start for DK-tenants, eller default-av som i Norge?
