## Hva er Fase A7?

A7 = **Shadow-verifisering** før unified data faktisk brukes noe sted i UI-et.

Konkret:
1. `airspace_unified_dk_enabled`-flagget står fortsatt `false` (produksjon uendret).
2. Ved hver lagring av oppdrag / risikoanalyse i DK kjøres **både** legacy-analysen (`dk_drone_zones`) og den nye unified-analysen i bakgrunnen. Bare legacy-resultatet vises til brukeren.
3. Diff-en logges i `airspace_shadow_comparisons` (tabellen finnes allerede fra A3).
4. `airspace_shadow_parity_rollup`-viewet viser Jaccard-parity per lag/land.
5. **Først når parity ≥ 99 % over rullerende 7 dager** vurderes flagget slått på — og selv da bare for DK, aldri Norge.

A7 rører altså **ingen** kart-UI, ingen norske brukere, ingen produksjonsflyt. Det er ren observasjon.

**Anbefaling:** Utsett A7 til vi har Sverige inne. Da har vi 2 land i unified-tabellen og kan verifisere at samme UI-knapp (`ctr`, `rpas`, `fareomrader`) styrer begge kildene korrekt før vi bruker tid på parity-måling.

---

## Denne runden: Fase B1 — Sverige (LFV) inn i unified schema

**Kilde:** LFV Dronechart WFS (`https://daim.lfv.se/geoserver/wfs`), OGC-standard GeoJSON. Oppdateres på AIRAC-syklus (28 dager). CC BY-NC-ND 4.0.

### Layer-mapping (LFV → canonical `layer_id`)

| LFV WFS typename | Kanonisk `layer_id` | `zone_type` | `restriction_type` |
|---|---|---|---|
| `mais:CTR` | `ctr` | CTR | APPROVAL_REQUIRED |
| `mais:TIZ` | `ctr` | TIZ | APPROVAL_REQUIRED |
| `mais:ATZ` | `ctr` | ATZ | APPROVAL_REQUIRED |
| `DAIM_TOPO:RWY5K` | `rpas` | DRONE_NO_FLY | APPROVAL_REQUIRED |
| `DAIM_TOPO:HKP1K` | `rpas` | DRONE_NO_FLY | APPROVAL_REQUIRED |
| `mais:RSTA` (kun `LOWER='GND/SFC'`) | `restriksjonsomrader` | RESTRICTED | PROHIBITED |
| `mais:DNGA` (kun `LOWER='GND'`) | `fareomrader` | DRONE_DANGER | CAUTION |

Utelates i første runde: `DAIM_TOPO:SUP` og `dynais:NOTAM` (temporær data — egen sync-kadens senere, matcher hvordan norske NOTAMs håndteres i dag).

Samme `layer_id` som Norge og Danmark → **én UI-knapp styrer alle tre land** automatisk gjennom eksisterende `airspace_layers`-lookup.

### Sikkerhetsprinsipper (samme som DK-adapteren)

- `authority_rank = 20` (nasjonal CAA), samme som Trafikstyrelsen.
- `dedupe_key`: `POSITIONINDICATOR` når finnes (ICAO), ellers normalisert `NAMEOFAREA`.
- **Ukjent typeverdi ⇒ fallback til CAUTION**, aldri PROHIBITED (samme regel som DK).
- CQL_FILTER på WFS-kall filtrerer bort høyder som ikke er relevante for drone (LOWER != GND/SFC).
- `source = 'lfv_se'`, `country_code = 'SE'`. Unik constraint `(source, country_code, external_id)` finnes.

### Deliverables

1. **Edge Function `sync-se-drone-zones`** (`supabase/functions/sync-se-drone-zones/index.ts`)
   - Én WFS `GetFeature` per lag (7 kall totalt), `outputFormat=application/json&srsname=EPSG:4326`.
   - Adapter i samme fil (matcher `sync-dk-drone-zones`-strukturen).
   - Klient-batching 500, kall `bulk_upsert_airspace_zones`.
   - Deaktivering kun ved alle-batcher-OK og feilrate ≤ 10 % (samme guardrails som DK).
   - Logger til `airspace_sync_runs` med `source='lfv_se'`, `country_code='SE'`.
   - Håndterer 3D-geometri via `ST_Force2D` (samme fix som DK).

2. **Config-toml-entry** for funksjonen (`verify_jwt = false` — den kalles av cron/manuell trigger).

3. **Manuell engangs-sync** trigges via migration (samme mønster som DK) etter deploy.

4. **Ingen UI-endringer.** Ingen nye flagg. Ingen norsk logikk endres.
5. **Ingen cron ennå** — engangs-sync først, cron settes opp når vi har Norge også migrert.

### Verifisering (før vi går videre)

Etter sync-kjøring, sjekk:
```sql
SELECT layer_id, zone_type, restriction_type, count(*)
FROM airspace_zones WHERE country_code='SE' AND active
GROUP BY 1,2,3 ORDER BY 1,2;
```
Forventet: rader i `ctr`, `rpas`, `restriksjonsomrader`, `fareomrader`. Null i `OTHER`. Ingen `PROHIBITED` uten grunnlag i LOWER-filter.

### Hva som IKKE skjer

- Ingen endringer i kart-UI, `mapLayers.ts`, `airspaceUnified.ts` eller safety-analyse.
- Flagg `airspace_unified_dk_enabled` forblir `false`.
- Norsk luftrom leses fortsatt utelukkende fra eksisterende tabeller.
- Ingen produksjonsflyt for eksisterende brukere berøres.

### Gjenstår etter B1

- **B2:** Cron for SE (etter at DK har kjørt stabilt en uke).
- **A7:** Shadow-parity mot DK legacy — kan nå kjøres med to land i unified.
- **A8:** Flagg-aktivering for DK+SE (fortsatt aldri NO).
- **C:** Norge-adapter (NSM/AIP/Verneområder → unified, med lang shadow-periode før avvikling av legacy).
