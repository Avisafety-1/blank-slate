# Bruke DJI-dronenavn til bedre automatch

## Hva dataene viser

Loggen `2e75304…6675` (Elverum vgs, 22.08.2026) kom inn med:
- `aircraft_name`: "DJI Mini 5 Pro Rane"
- `aircraft_sn`: `1581F9DEC259A029` (16 tegn — DJI-loggen kutter serienummeret)

Elverum har 10 aktive droner. Sammenlignet med de lagrede 20-tegns serienumrene gir 16-tegns-prefikset kollisjoner:

```text
prefiks 1581F9DEC2584029  -> DM5P-01, DM5P-02          (2 treff)
prefiks 1581F9DEC259D029  -> DM5P-05, DM5P-06, DM5P-07 (3 treff)
prefiks 1581F9DEC259A029  -> DM5P-03                   (unikt)
prefiks 1581F9DEC259B029  -> DM5P-04                   (unikt)
```

Denne loggen traff altså riktig drone (DM5P-03) på serienummer alene. Men navnet "…Rane" bekrefter at brukerne gir dronene egne kallenavn i DJI Fly, og det navnet følger med i loggen. Det er nøkkelen til å løse kollisjonene for DM5P-01/02 og DM5P-05/06/07.

Sidefunn: DM5P-08 er lagret med serienummer `1591F9DEC259D029Y2FS` — "1591" der de andre har "1581". Ser ut som en tastefeil ved registrering, bør verifiseres mot dronen.

## Forslag

1. **Nytt felt på drone: "DJI-navn (i DJI Fly)"**
   - Valgfritt tekstfelt på dronekortet/rediger-dialogen.
   - Fylles av admin, eller foreslås automatisk (se punkt 3).

2. **Automatch bruker navnet som avgjørende faktor**
   - Rekkefølge ved matching: eksakt serienummer → prefiks-serienummer + DJI-navn → prefiks-serienummer + pilotens tilknyttede droner → ellers manuelt valg.
   - Navnematching er case-insensitiv og tåler ekstra tekst rundt (modellnavn foran kallenavnet).
   - Gjelder både enkeltopplasting, batch-logging og automatisk DJI-synk.

3. **Auto-læring av navn**
   - Når en logg treffer nøyaktig én drone på serienummer og dronen mangler DJI-navn, lagres loggens `aircraft_name` på dronen (som forslag/verdi). Overskriver aldri et navn admin har satt.

4. **Tydelig i UI når det er tvil**
   - Ved flere kandidater vises hvorfor (likt serienummerprefiks), med navnet fra loggen listet, slik at pilot velger riktig drone og navnet lagres for neste gang.

## Teknisk

- Migrasjon: `drones.dji_aircraft_name text` (nullable) + indeks på `(company_id, lower(dji_aircraft_name))`.
- `src/lib/droneLogMatching.ts`: utvid `findSnMatches` med `logAircraftName`-parameter; ny hjelper `nameMatchesDrone(stored, logName)` (normalisering: lowercase, trim, kollaps mellomrom, `includes`-sammenligning begge veier).
- Kallsteder oppdateres: `src/components/UploadDroneLogDialog.tsx` (linje ~705, ~988, ~1109), `src/components/upload/BatchLogPanel.tsx` (~121).
- Serverside auto-match i `supabase/functions/dji-sync-worker` og `dji-process-single`: samme prioritering + auto-læring av navn når treffet er unikt.
- Dronedialog: nytt felt med hjelpetekst om at navnet må matche navnet i DJI Fly.
- Alle nye strenger i `no.json` og `en.json`.
