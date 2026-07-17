# Unified European Airspace — Fase A

Mål: Skalerbar felles luftromsmodell for hele Europa, uten at dagens brukere merker regresjon. Danske data blir første konsument.

## Prinsipper (ikke-forhandlingsbare)

1. **UI-fryse i Fase A.** Ingen endringer i `src/components/**`, `src/config/mapLayers.ts` eller eksisterende safety-analyse-RPC-er. Dagens knapper og lag ser og oppfører seg identisk.
2. **Additivt i DB.** Ingen `DROP`/`ALTER` på eksisterende tabeller (`caa_drone_zones`, `dk_drone_zones`, `dk_nature_areas`, `nsm_restriction_zones`, `rpas_5km_zones`, `rpas_ctr_tiz`, `aip_restriction_zones`, `naturvern_zones`, `notams` …). Ny modell lever ved siden av.
3. **Kill switch.** Alt som leser fra ny modell er gated bak `app_config`-flagg som kan slås av uten deploy.
4. **Dual-write er non-blocking.** Feil i ny sync-sti fanges og logges — påvirker aldri eksisterende produksjonssync.

## Datamodell (Fase A1)

### `airspace_zones`
Én rad per sone. Kolonner:
- `id uuid pk`, `created_at`, `updated_at`
- `country_code text` (ISO-3166-1 alpha-2: `NO`, `DK`, …)
- `source text` (`caa_no`, `nsm`, `rpas`, `openaip`, `trafikstyrelsen_dk`, `notam_rss`, `naturvern_no` …)
- `external_id text` — stabil id fra kilden
- `zone_type text` — normalisert klasse styrt av UI-knapp: `CTR`, `TIZ`, `TMZ`, `RMZ`, `ATZ`, `P`, `R`, `D`, `RPAS_5KM`, `ATZ_5KM`, `NSM`, `NATURE`, `NOTAM`, `OBSTACLE`, `POWERLINE`, `OTHER`
- `restriction_type text` — semantikk for safety-analyse: `PROHIBITED`, `RESTRICTED`, `APPROVAL_REQUIRED`, `NOTIFICATION`, `INFO`, `NATURE_SENSITIVE`
- `display_class text` — fargeklasse for kart/varsler: `RED`, `AMBER`, `BLUE`, `GREEN`, `GREY`
- `theme text nullable` — undertema (`bird_sanctuary`, `military`, `airport_5km`, …)
- `name text`, `short_name text nullable`, `authority text nullable`
- `lower_limit_m int nullable`, `upper_limit_m int nullable` (normalisert AMSL i meter)
- `lower_limit_raw text nullable`, `upper_limit_raw text nullable`, `altitude_reference text nullable` (`AMSL`/`AGL`/`FL`/`SFC`/`UNL`)
- `valid_from timestamptz nullable`, `valid_to timestamptz nullable`
- `active boolean not null default true`
- `properties jsonb not null default '{}'` — full rå-record fra kilden
- `geom geometry(Geometry, 4326) not null`
- Indekser: `GIST(geom)`, `btree(country_code, zone_type)`, `btree(source, external_id)` unik, `btree(active)`.

`zone_type`, `restriction_type`, `display_class` som **`text` + `CHECK`-constraint** (ikke enums) — enklere å utvide når nye land legges til.

### `airspace_sync_runs`
- `id uuid pk`, `source text`, `country_code text`, `started_at`, `finished_at nullable`
- `status text` (`running`,`success`,`failed`,`aborted`)
- `fetched_count int`, `valid_count int`, `upserted_count int`, `deactivated_count int`
- `error text nullable`, `stats jsonb`

Sync-regler:
- Aldri hard-delete. Manglende `external_id` i ny hent → `active=false`.
- **Nekt deaktivering hvis `valid_count < 0.5 * forrige_success.valid_count`** — marker run `aborted` og alarm.
- Første run per source godtar alt (ingen tidligere baseline).

### `app_config`-flagg
- `airspace_unified_dk_enabled` (default `false`)
- `airspace_unified_shadow_logging` (default `false`)

### RPC-er (kun lesing, tilgjengelig for authenticated)
- `airspace_zones_in_bbox(bbox, zone_types text[], country_codes text[])`
- `airspace_zones_intersecting_route(route geojson, buffer_m int, zone_types text[], country_codes text[])`
Begge respekterer `active=true` og filtrerer på `zone_type`. Ingen frontend kaller disse i Fase A1/A2.

## Faser

### Fase A1 — Skjema + RPC-er
Kun DB-migration. Ingen kodeendringer. Ingen brukerpåvirkning mulig.
Leveranse: migration + RLS (`SELECT` til `authenticated`, `ALL` til `service_role`, ingen `anon`).

### Fase A2 — Dual-write for Danmark
Utvid `sync-dk-drone-zones` og en ny `sync-dk-nature-areas`-sti til å **også** skrive til `airspace_zones` etter at eksisterende skriving er ferdig. Mapping:
- Trafikstyrelsen `Farve=1` (rød) → `zone_type='CTR'` når `typeId` indikerer luftrom, ellers `RESTRICTED`/`RED`
- `Farve=4` (orange) → `APPROVAL_REQUIRED`/`AMBER`
- `Farve=5` (blå) → `NOTIFICATION`/`BLUE`
- Naturområder → `zone_type='NATURE'`, `restriction_type='NATURE_SENSITIVE'`, `theme` fra Temanavn
Feil i ny sti: fang, logg til `airspace_sync_runs.status='failed'`, ikke kast videre.

### Fase A3 — Shadow-sammenligning
Ny edge-funksjon `airspace-shadow-compare` (manuelt trigget + daglig cron). For et sett av testruter i Norge:
- Kjør eksisterende `check_mission_airspace`
- Kjør ny `airspace_zones_intersecting_route` filtrert på tilsvarende `zone_type`
- Logg diff til `airspace_shadow_results`
Aksept: **≥ 99% paritet** på antall og identitet av matchende soner over 7 sammenhengende dager før A4 aktiveres.

### Fase A4 — Aktivering for Danmark (bak flagg)
Ny helper i safety-analyse som:
- For NO-oppdrag: bruker eksisterende RPC uendret.
- For DK-oppdrag (bestemt av oppdragets koordinat/land): bruker `airspace_zones_intersecting_route` når `airspace_unified_dk_enabled=true`.
Kartlag: eksisterende DK-lag fortsetter å tegne fra `dk_drone_zones`/`dk_nature_areas` — ingen visuell endring. Kun safety-analyse og risikovurdering får nye advarsler for DK.

## Aksept­kriterier

1. Ingen endringer i `src/components/**` eller `src/config/mapLayers.ts` i A1–A3.
2. Alle nye lesestier gated av `app_config`-flagg som default `false`.
3. Sync-run som ville deaktivert >50% av forrige baseline avbrytes automatisk.
4. Fase A4 aktiveres kun etter ≥ 99% shadow-paritet i 7 dager.
5. Feil i dual-write-sti bryter aldri eksisterende sync — verifiseres med bevisst feilinjeksjon i staging.
6. Rollback = sett flagg `airspace_unified_dk_enabled=false`. Ingen migration-revert nødvendig.

## Risikomatrise

| Risiko | Sannsynlighet | Konsekvens | Mitigering |
|---|---|---|---|
| NO-brukere mister kartlag | Svært lav | Høy | UI-fryse, ingen endring i `mapLayers.ts` eller kartkomponenter |
| NO safety-analyse endres | Svært lav | Kritisk | Ny RPC kalles ikke for NO i Fase A; kill switch + shadow-krav |
| Ny sync korrupterer eksisterende DK-data | Lav | Middels | Dual-write skriver kun til ny tabell; gammel sti urørt |
| Trafikstyrelsen-endpoint endrer format | Middels | Lav | Sync-run aborterer ved <50% baseline; alarm |
| DK-brukere får feilaktige varsler i A4 | Lav | Middels | Shadow ≥99% paritet + flagg-styrt utrulling |
| RLS-lekkasje | Lav | Høy | `SELECT` kun til `authenticated`, ingen `anon`-grant, testes i lint |

## Utenfor scope for Fase A

- Sverige, Finland, Tyskland etc. (Fase B+, samme mønster)
- Migrering av NO-data til ny tabell (Fase C, når A er stabil)
- Endringer i `MapLayerControl` eller `MAP_LAYER_CATALOG`
- Nye UI-varsler eller badges

## Leveranse

Fire separate PR-er i rekkefølge (A1 → A4), med verifisering mellom hver. A1 kan merges straks; A2–A4 krever eksplisitt godkjenning per steg.
