# Bytte beacons til SafeSky produksjons-API

## Status i dag
- `safesky-beacons-fetch` (den som fyller kartet med trafikk) kaller **sandbox**: `https://sandbox-public-api.safesky.app/v1/beacons?viewport=47.0,5.0,72.0,32.0&return_grounded_traffic=true` med `x-api-key` fra `SAFESKY_BEACONS_API_KEY` / `SAFESKY_API_KEY`.
- Ny produksjonsnøkkel `SAFESKY_BEACONS_PROD_API_KEY` er verifisert mot `https://public-api.safesky.app/v1/beacons` → **200 OK, 1182 beacons**.
- Midlertidig testfunksjon `safesky-beacons-prodtest` er slettet.

## Hva som skal endres (kun beacons)
Kun i `supabase/functions/safesky-beacons-fetch/index.ts`:
1. Vertsnavn: `sandbox-public-api.safesky.app` → `public-api.safesky.app` (både i URL-konstanten og i safeFetch-allowlisten).
2. Nøkkelvalg: prøv `SAFESKY_BEACONS_PROD_API_KEY` først, deretter dagens `SAFESKY_BEACONS_API_KEY` / `SAFESKY_API_KEY` som fallback.
3. Logglinjer justeres fra "sandbox" til å vise hvilket miljø/nøkkel som faktisk brukes.
4. Verifisere at `return_grounded_traffic=true` fortsatt godtas i prod; hvis prod svarer 4xx på parameteren, faller vi tilbake til kall uten den.

## Hva som IKKE endres
- `safesky-advisory` (publisering av advisory og live UAV) — uendret, fortsatt samme URL-er og nøkler.
- `safesky-cron-refresh` — uendret.
- `safesky-beacons` (`/v1/uav`-oppslag rundt et punkt) — uendret i denne runden.
- Ingen endringer i database, RLS, HMAC-signering eller frontend/kartlag.

## Rollback
Ett-linjes reversering: sett verten tilbake til sandbox og fjern prod-nøkkelen fra oppslagsrekkefølgen. Fallback-rekkefølgen gjør at systemet fortsatt virker om prod-nøkkelen fjernes.

## Verifisering etter utrulling
- Kalle `safesky-beacons-fetch` og bekrefte HTTP 200 og antall beacons > 0.
- Sjekke edge-funksjonslogger for feil, og at trafikklaget i kartet viser fly som før.
