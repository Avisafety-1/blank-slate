## Justeringer basert på siste tilbakemelding

Endringene fra forrige plan er innarbeidet: delte precedence-views, gyldighetstidsvindu i precedence, NOTAM-unntak fra dedup mot permanent luftrom, partial unique index, og partial GIST. Ingen UI-endringer i denne fasen; `airspace_unified_dk_enabled` forblir `false`.

## Arkitektur (uendret prinsipp)

```text
source → adapter (per source_id) → CanonicalZone → airspace_zones
                                                          │
                                                          ├─ airspace_zones_with_precedence  (alle rader + is_shadowed)
                                                          └─ resolved_airspace_zones         (kun aktive vinnere)
                                                                     │
                                                                     ▼
                                                            safety RPCs (les kun herfra)
```

## 1. Taksonomi (uendret)

- `layer_id` matcher `MAP_LAYER_CATALOG`. Ny id `drone_restriction`, `defaultEnabled: false`.
- `zone_type` finkornet: `CTR, TIZ, TMA, ATZ, RMZ, TMZ, R, D, P, AIRPORT_AD, HELIPORT, MODEL_AIRFIELD, HEMS, NATURE_BIRDS, NATURE_HABITAT, NATURE_OTHER, DRONE_NOFLY, DRONE_APPROVAL, DRONE_NOTIFY, DRONE_INFO, NOTAM, OBSTACLE, OTHER`.
- `restriction_type`: `PROHIBITED, APPROVAL_REQUIRED, NOTIFICATION, INFO, CAUTION`.

## 2. Adapter per **kilde**

`supabase/functions/_shared/airspace-adapters/`: `types.ts`, `registry.ts`, én fil per `source_id`. Adaptere deklarerer egen `fallbackLayerId`. Ukjente kildeverdier → `zone_type='OTHER'`, `restriction_type='CAUTION'` (aldri `PROHIBITED`), logges i `airspace_sync_runs.stats.unmapped[]`.

Hver adapter setter i `properties`:
- `raw_type` — kildens originale typeverdi
- `adapter_version` — semver-streng for adapteren
- `mapping_basis` — hvilket felt/regel som avgjorde `zone_type` og `restriction_type` (`"typeId=12→R"`, `"fallback:unknown"`, …)

Dette er revisjonssporet — låst konvensjon fra dag én.

## 3. DK-mapping — typeId-primær, farge kun sekundær

Uendret fra forrige plan. `PROHIBITED` skal aldri stamme fra farge alene.

## 4. Precedence / deduplisering

### Kolonner på `airspace_zones` (Fase A1)

- `authority_rank smallint not null default 50`
- `dedupe_key text nullable`

Standardrangering: nasjonal luftfartsmyndighet=10, nasjonal sektormyndighet=20, nasjonal aggregator=30, NOTAM=40 (høyere prioritet i sin gyldighetsperiode, men se punkt 4c), OpenAIP=60.

### 4a. To views — delt ansvar

**`airspace_zones_with_precedence`** (security_invoker) — diagnostikk/QA:
```sql
SELECT
  z.*,
  ROW_NUMBER() OVER (
    PARTITION BY z.country_code, z.dedupe_key
    ORDER BY z.authority_rank ASC, z.updated_at DESC
  ) AS precedence_rank,
  (z.dedupe_key IS NOT NULL
    AND ROW_NUMBER() OVER (
      PARTITION BY z.country_code, z.dedupe_key
      ORDER BY z.authority_rank ASC, z.updated_at DESC
    ) > 1) AS is_shadowed
FROM public.airspace_zones z
WHERE z.dedupe_key IS NOT NULL
UNION ALL
SELECT z.*, 1 AS precedence_rank, false AS is_shadowed
FROM public.airspace_zones z
WHERE z.dedupe_key IS NULL;
```

**`resolved_airspace_zones`** (security_invoker) — kun aktive vinnere; safety-RPC-er leser herfra:
```sql
SELECT z.*
FROM public.airspace_zones_with_precedence z
WHERE z.active = true
  AND z.is_shadowed = false
  AND (z.valid_from IS NULL OR z.valid_from <= now())
  AND (z.valid_to   IS NULL OR z.valid_to   >  now());
```

### 4b. Gyldighet ekskluderer skyggeleggere i precedence-vinduet

Kritisk detalj: inaktive eller utløpte rader skal aldri kunne skygge aktive/gyldige rader. Precedence-partisjonen begrenses derfor til «kandidater i live-vindu» — utløpte og inaktive rader deltar ikke i `ROW_NUMBER()`-partisjonen:

```sql
-- Filter anvendt før precedence-partisjonering i airspace_zones_with_precedence
WITH live_candidates AS (
  SELECT z.*
  FROM public.airspace_zones z
  WHERE z.active = true
    AND (z.valid_from IS NULL OR z.valid_from <= now())
    AND (z.valid_to   IS NULL OR z.valid_to   >  now())
)
-- deretter ROW_NUMBER() over live_candidates for is_shadowed
-- ...og en egen tilførsel av inaktive/utløpte rader med is_shadowed=false og precedence_rank=NULL
```

Slik at:
- En utløpt Luftfartstilsynet-rad (rank=10) kan ikke skygge en aktiv OpenAIP-rad (rank=60).
- En deaktivert nasjonal rad frigjør automatisk sin OpenAIP-motpart.
- `airspace_zones_with_precedence` viser fortsatt alle rader (inkl. de utenfor live-vinduet) med `is_shadowed=false, precedence_rank=NULL` slik at QA kan se hva som ikke deltar.

### 4c. NOTAM skygger aldri permanent luftrom

NOTAM dedupliseres kun mot andre NOTAM/samme hendelsesidentitet. Adaptere skal:

- Sette `dedupe_key = 'NOTAM:' || <notam_series>-<number>/<year>` (f.eks. `NOTAM:A0123/26`) — aldri en nøkkel som kolliderer med permanent luftroms-nøkkel.
- Aldri sette `dedupe_key` som matcher `CTR:ICAO:*`, `R:ID:*`, `AIRPORT_AD:ICAO:*` osv. — selv om NOTAM refererer til samme ICAO.

Regel håndheves som CHECK-constraint:
```sql
ALTER TABLE public.airspace_zones
  ADD CONSTRAINT airspace_notam_dedupe_prefix
  CHECK (
    zone_type <> 'NOTAM'
    OR dedupe_key IS NULL
    OR dedupe_key LIKE 'NOTAM:%'
  );
```

Konsekvens: en NOTAM som «lukker» EN-R102 er en ekstra rad ved siden av permanent-raden — begge vises, begge triggerer safety-analyse. Dette er tilsiktet, siden brukeren må vite både om den permanente restriksjonen og den midlertidige.

## 5. Indeksering (justert)

- `GIST(geom) WHERE active = true` — partial, siden RPC-ene kun leser aktive soner. Sparer plass og holder indeksen varm.
- `BTREE(country_code, layer_id, active)` — sammensatt filter-index.
- Ingen separat `BTREE(active)`.
- `BTREE(dedupe_key, country_code) WHERE dedupe_key IS NOT NULL` — precedence-view.
- **Partial unique index** i stedet for full unique:
  ```sql
  CREATE UNIQUE INDEX airspace_zones_source_external_uk
    ON public.airspace_zones (source_id, country_code, external_id)
    WHERE external_id IS NOT NULL;
  ```
  Kilder uten stabil `external_id` (f.eks. enkelte NOTAM-varianter) kan da sameksistere uten å bryte constraint. Manuell dedup for slike kilder skjer i adapteren via `dedupe_key`.

## 6. Bulk upsert-signatur (justert)

`bulk_upsert_airspace_zones(zones jsonb)` tar én rad per objekt med feltene:
```
source_id, country_code, external_id (nullable),
layer_id, zone_type, restriction_type, authority_rank, dedupe_key (nullable),
name, short_name, authority,
lower_limit_m, upper_limit_m, lower_limit_raw, upper_limit_raw, altitude_reference,
valid_from, valid_to,
buffer (numeric, ikke integer),
geom_geojson,
properties (jsonb — må inneholde raw_type, adapter_version, mapping_basis)
```
RPC validerer at `properties ? 'raw_type' AND properties ? 'adapter_version' AND properties ? 'mapping_basis'` og avviser rader som mangler.

## 7. Endringer i denne omgangen (oppdatert)

**Migrasjon (A1.1)**
1. `ALTER TABLE airspace_zones`: `layer_id text NOT NULL` (backfill først), `authority_rank smallint NOT NULL DEFAULT 50`, `dedupe_key text NULL`. Utvid `zone_type` CHECK. Legg til NOTAM-dedupe CHECK.
2. Konverter `buffer` til `numeric`.
3. Bytt full unique på `(source, external_id)` til partial unique på `(source_id, country_code, external_id) WHERE external_id IS NOT NULL`.
4. Drop `BTREE(active)`. Opprett `GIST(geom) WHERE active = true` og øvrige indekser fra punkt 5.
5. `CREATE VIEW airspace_zones_with_precedence` (live-vindu-partisjonert, alle rader inkludert utenfor vindu med `is_shadowed=false`).
6. `CREATE VIEW resolved_airspace_zones` (aktive vinnere i live-vindu).
7. Oppdater `airspace_zones_in_bbox` / `airspace_zones_intersecting_route` til `FROM resolved_airspace_zones`.
8. `bulk_upsert_airspace_zones`: ny signatur + krav om `raw_type`/`adapter_version`/`mapping_basis` i `properties`.
9. Backfill de 237 DK-radene: sett `layer_id`, `authority_rank=10`, `dedupe_key` der `typeId`/ICAO tillater, og fyll `properties.raw_type`/`adapter_version='dk-legacy-backfill'`/`mapping_basis`.

**Kode**
10. `_shared/airspace-adapters/`: `types.ts`, `registry.ts`, delt sync-runtime som håndhever `properties`-kravene.
11. `trafikstyrelsen-dk.ts` v1.0.0.
12. Refaktor `sync-dk-drone-zones` til å bruke adapteren.
13. Engangs-sync DK.

**Katalog**
14. `MAP_LAYER_CATALOG`: legg til `drone_restriction`, `defaultEnabled: false`. Ingen kartkomponent-endring.

## 8. Bevisst ikke i denne runden

- `airspace_unified_dk_enabled` forblir `false`.
- Ingen sletting av legacy-tabeller.
- Ingen endring i `MapLayerControl` / `OpenAIPMap`.
- Ingen OpenAIP-adapter.

## 9. Akseptkriterier

1. **Ingen inaktiv eller utløpt rad skygger en aktiv rad.** Verifiseres av dedikert SQL-test som setter opp én aktiv OpenAIP-rad og én utløpt LT-rad med samme `dedupe_key`, og bekrefter at OpenAIP-raden er i `resolved_airspace_zones`.
2. **Samme `dedupe_key` innen samme `country_code` skal ikke ha ulike `zone_type` uten eksplisitt godkjenning.** Sync-runtime kjører en post-batch QA-query og legger avvik i `airspace_sync_runs.stats.dedupe_type_conflicts[]`; run marker `aborted` hvis listen ikke er tom, med mindre `stats.allow_dedupe_type_conflicts=true` er satt for det spesifikke run-et.
3. **NOTAM-rad skygger aldri permanent luftrom.** Verifiseres av CHECK-constraint + SQL-test.
4. **Antall rå og resolved rader per `source_id` dokumenteres** i `airspace_sync_runs.stats` som `{ raw_count, resolved_count, shadowed_count }` per run, og eksponeres i en `airspace_source_health`-view for QA-dashboard.
5. **`properties.raw_type`, `properties.adapter_version` og `properties.mapping_basis` er tilstede på alle nye rader.** Håndheves i `bulk_upsert_airspace_zones`.
6. DK-sync produserer 0 rader med `restriction_type=PROHIBITED` som stammer fra farge alene (`properties.mapping_basis` inspiseres).
7. `unmapped[]` for DK er tom eller kun inneholder verdier bevisst klassifisert som `OTHER/CAUTION`.
8. `resolved_airspace_zones` returnerer samme antall som `airspace_zones WHERE active AND valid_from/to gjelder` for DK (ingen duplikater å skygge enda).
9. Ingen visuell eller funksjonell endring for eksisterende brukere.
