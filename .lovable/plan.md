
## Problem

Ingenting fra Polen vises på kartet av to grunner:

**1. UI-fetcheren spør ikke etter PL.**
I `src/components/OpenAIPMap.tsx` (linje ~1440) er `UNIFIED_COUNTRIES = ['DK','SE','DE','FI']`. Cache-nøkkelen er også hardkodet `DE,DK,FI,SE`. PL blir dermed aldri hentet, uansett hvilket kartlag som er på.

**2. Feil kategorisering i databasen** (bekreftet via query):

```
layer_id=airspace, zone_type=DRONE_DANGER  1544   ← generisk luftrom (CTR/ATZ/TMA) merket som drone-fare
layer_id=rpas,     zone_type=DRONE_DANGER   877   ← DRA-R (restricted) havnet under RPAS/no-fly toggle
layer_id=rpas,     zone_type=DRONE_NO_FLY   177   ← DRA-P (prohibited) — riktig
layer_id=rpas,     zone_type=DRONE_PROTECTED_OBJECT 140 ← DRA-I (info) — bør ligge under "sikringsobjekter" eller "fareområder"
```

Ingen rader har `layer_id='restriksjonsomrader'`, `'fareomrader'` eller `'verneomrader'`, så selv de togglene brukeren skrur på finner ingenting.

## Fix

### A. UI-wiring — inkluder PL i unified-fetch

I `src/components/OpenAIPMap.tsx`:
- Endre `UNIFIED_COUNTRIES` fra `['DK','SE','DE','FI']` → `['DK','SE','DE','FI','PL']`.
- Bytt hardkodet cache-suffix `DE,DK,FI,SE` → dynamisk `UNIFIED_COUNTRIES.slice().sort().join(',')` slik at PL blir med i alle `resetCache('unified:…')`-kall.

Ingen andre steder trenger endring — `airspaceUnified.ts` har allerede PL i type/bounds og RPC-en filtrerer på `country_code`.

### B. Re-klassifiser eksisterende PL-rader

Én migrasjon som oppdaterer `layer_id` + `zone_type` for `country_code='PL'` basert på KML-descriptionen som allerede ligger i `properties`:

| Kilde (KML `type`/`restriction`)      | Nytt `layer_id`         | Nytt `zone_type`         |
| --- | --- | --- |
| DRA-P (Prohibited)                    | `rpas`                  | `DRONE_NO_FLY`           |
| DRA-R (Restricted)                    | `restriksjonsomrader`   | `R`                      |
| DRA-I (Information / notification)    | `fareomrader`           | `DRONE_DANGER`           |
| CTR / MCTR                            | `airspace`              | `CTR`                    |
| ATZ / MATZ                            | `airspace`              | `ATZ`                    |
| TMA / MTMA / CTA / TSA / TRA / EA     | `airspace`              | `TMA` (eller behold `properties.kml_type`) |
| ADIZ / andre                          | filtreres bort (`active=false`) hvis irrelevant for drone (samme prinsipp som Finland-oppryddingen) |

Regelen leses fra `properties->>'type'` og `properties->>'restriction_type'` (KML-parseren la begge dit).

### C. Fikser i KML-parseren (`supabase/functions/backfill-poland-kml/index.ts`)

Slik at neste re-import ikke gjenskaper feilen: bruk samme mapping som B over, og filtrer bort høyt luftrom (CTA/TMA over 1000 m AMSL / class A-C) på samme måte som `sync-fi-drone-zones` — så PL blir ryddig som Finland/Sverige, ikke overfylt.

### D. Verifisering (kun Moderavdeling)

1. Query: `SELECT layer_id, zone_type, count(*) FROM airspace_zones WHERE country_code='PL' GROUP BY 1,2` — forvent rimelig fordeling (P<<R<I, samt CTR/ATZ).
2. Preview i Moderavdeling, zoom inn på Warszawa/Kraków:
   - RPAS-toggle: viser DRA-P sirkler rundt sensitive objekter.
   - Restricted areas: viser DRA-R.
   - Danger areas: viser DRA-I.
   - RMZ/TMZ/ATZ: viser CTR/ATZ.
3. Norge og andre selskaper: ingen endring (allowlist + `country_code`-filter uendret).

## Ikke i scope

- Verneområder, hindringer og NOTAM for PL (Phase P4 — egen runde).
- Norsk luftrom eller andre lands data.

## Filer

- `src/components/OpenAIPMap.tsx` — 2 små endringer i unified-fetch-blokken.
- `supabase/functions/backfill-poland-kml/index.ts` — oppdatert mapping + filter.
- Ny migrasjon: `update airspace_zones set layer_id=…, zone_type=… where country_code='PL' and …` (én UPDATE per kategori).
