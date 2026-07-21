# Rens opp finsk luftrom — vis kun drone-relevante soner

## Rotårsak (verifisert i DB)

Fintraffic-adapteren importerer *hele* nasjonalt luftrom fra `Airspace`-datasettet og klassifiserer alt som `CTR` (AMBER). Det gir 176 store polygoner som overlapper hverandre og farger hele Finland oransje:

| ftype | antall | max km² | kommentar |
|---|---|---|---|
| FIR | 1 | 416 057 | hele Finland-FIR |
| SECTOR | 14 | 74 970 | ATC-sektorer, ikke drone-relevant |
| ADIZ | 1 | 17 410 | luftforsvarssone langs grensen |
| RAS | 1 | 11 524 | rikstjeneste-sektor |
| TMA_P | 8 | 12 246 | høyt TMA (lower ~550 m) |
| (uten type) | 106 | 14 146 | CTA/TMA — EFJY CTA, EFOU TMA … |
| OTHER:RMZ | 5 | 630 | radio mandatory zone |
| D_OTHER | 39 | 79 | mindre D-områder |
| P | 7 | 66 | forbudte soner (allerede riktig som R/RED) |
| PROTECT | 1 | 64 | |

Ingen av disse feature-typene endres av dagens `refineAirspaceFeature` (som bare kjenner igjen `P`/`R`/`D`). Resultat: TMA/CTA/FIR/SECTOR/ADIZ blir alle CTR-amber og dekker hele landet. UAS-sonene (819 røde soner rundt flyplasser) og R-sonene (7 stk) er allerede riktige.

flyk.com viser kun UAS-soner (rødt/gult rundt flyplasser), små CTR-er, R/D-områder — samme filosofi vi bør følge.

## Endringer

**Kun `supabase/functions/sync-fi-drone-zones/index.ts`** — ingen DB-schema-endringer, ingen UI-endringer, ingen påvirkning på NO/DK/SE/DE eller andre selskaper.

### 1. Skip drone-irrelevante feature-typer under normalisering

I `buildUnifiedFeatures`, før raden lages, dropp features hvor `properties.type` er:
- `FIR`, `SECTOR`, `ADIZ`, `RAS`, `TMA_P`, `PROTECT`, `OTHER:RMZ`
- Alle features med `type == null` **og** navn som slutter på ` CTA`, ` TMA`, ` FIR`, ` UIR` (EFJY CTA, EFOU TMA, osv.)

Disse teller da som `skipped` i statistikken, men det er tilsiktet — ikke en feil.

### 2. Utvid `refineAirspaceFeature` med CTR-heuristikk

CTR-features (mindre soner rundt selve flyplassen, typisk <100 km², nedre limit = GND) skal fortsatt vises som AMBER CTR. Uklassifiserte features med lite areal og GND-basert nedre limit kan beholdes som CTR. Enkleste regel: behold features hvor `type ∈ {CTR, CTA_LOW}` eller navn ender på ` CTR`. Alt annet uten eksplisitt P/R/D droppes.

### 3. Løft `UNIFIED_MAX_SKIPPED_RATIO`

Filtreringen vil skipe ~30 % av airspace-features med vilje. Terskelen `0.1` for `deactivate_stale_airspace_zones` må heves for source `fintraffic_fi_airspace` (f.eks. til `0.6`), ellers blir deaktivering hoppet over med grunn `high_skipped_ratio` og gamle rader blir liggende.

### 4. Kjør synk på nytt

Etter deploy: kall `sync-fi-drone-zones` én gang. `deactivate_stale_airspace_zones` fjerner FIR/CTA/TMA/SECTOR/ADIZ automatisk (siden de ikke lenger er i `keep_external_ids`), og kartet får kun UAS + små CTR + R/D.

## Sikkerhet / scope

- Kun Fintraffic-adapteren endres. NO/DK/SE/DE/CAA/nature/obstacles er urørt.
- Ingen kode- eller RLS-endring i klienten. Alle brukere (også utenfor Moderavdeling-allowlisten) ser en renere FI, men UI-toggler og lag er identiske.
- `airspace_zones`-rader deaktiveres via eksisterende `deactivate_stale_airspace_zones` — samme mekanisme som brukes daglig, ingen sletting.

## Verifisering etterpå

```sql
SELECT properties->>'type' AS ftype, COUNT(*), MAX(ROUND((ST_Area(geom::geography)/1e6)::numeric,0)) AS max_km2
FROM airspace_zones WHERE country_code='FI' AND source='fintraffic_fi_airspace' AND active
GROUP BY 1 ORDER BY 3 DESC;
```

Forventet: kun `P`, `D`, `CTR` (og evt. små uklassifiserte CTR-navn) igjen, `max_km2` under ~500.
