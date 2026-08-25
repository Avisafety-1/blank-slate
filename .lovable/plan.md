# Test SafeSky produksjon uten å røre dagens trafikkbilde

## Hva vi vet

Innhenting av trafikk (det som tegnes i kartet) går mot SafeSky sitt **sandbox**-miljø:

- `supabase/functions/safesky-beacons-fetch/index.ts` henter fra `sandbox-public-api.safesky.app/v1/beacons` (host er også låst i SSRF-allowlisten).
- `supabase/functions/safesky-beacons/index.ts` og `safesky-cron-refresh` henter fra `sandbox-public-api.safesky.app/v1/uav` (bekreftet i edge-loggene nå).

Publisering av våre egne advisories går derimot mot **produksjon**:

- `safesky-advisory` / `safesky-cron-refresh` bruker `uav-api.safesky.app/v1/advisory` med `SAFESKY_PROD_API_KEY` (loggen sier «Using PRODUCTION key for advisory refresh»).

Det forklarer det du ser: våre advisories havner i live SafeSky (og synes i droneflykart), mens vi leser trafikk fra sandbox — droneflykart sin advisory ligger i live-miljøet og finnes ikke i sandbox-svaret. Ubekreftet inntil vi faktisk har kalt produksjons-endepunktet; det er hele testen under.

## Slik tester vi — helt uten å påvirke Avisafe

Ingenting av dagens flyt endres. Trafikkbildet fortsetter å hentes fra sandbox nøyaktig som i dag, og advisory-publiseringen røres ikke.

1. Ny, isolert testfunksjon `safesky-env-compare` som kun kjøres manuelt (av oss/superadmin). Den:
   - henter samme viewport/punkt fra både sandbox og produksjon,
   - returnerer antall beacons, callsigns og eventuell HTTP-feil per miljø,
   - skriver **ingenting** til databasen og påvirker ikke kartet.
2. Vi kjører den mot området i skjermbildet (Trondheimsfjorden/ENVA) og ser om callsign `DFKZQRYHHQG` / `HWX188002` dukker opp i produksjonssvaret men ikke i sandbox.
3. Du får resultatet i chatten. Først når det er bekreftet — og du sier ifra — lager vi en egen plan for å bytte selve innhentingen til produksjon.
4. Hvis produksjonskallet svarer 401/403, er det nøkkelen/abonnementet hos SafeSky som må utvides. Da rapporterer vi feilmeldingen tilbake, og ingenting i appen er endret.

Når testen er ferdig kan funksjonen slettes igjen med ett grep, siden ingen annen kode kaller den.

## Teknisk

- Ny fil `supabase/functions/safesky-env-compare/index.ts`:
  - Krever JWT + superadmin-sjekk (service role client) slik at den ikke er åpen.
  - Body: `{ lat, lon, rad }` eller `{ viewport }`; default = området i skjermbildet.
  - Kaller `GET /v1/uav` (og `/v1/beacons`) mot både `sandbox-public-api.safesky.app` (`SAFESKY_API_KEY`) og produksjonshosten (`SAFESKY_PROD_API_KEY`), signert med eksisterende `_shared/safesky-hmac.ts`.
  - `safeFetch`-allowlisten i denne funksjonen får begge hostene; `_shared/http.ts` endres ikke.
  - Returnerer `{ sandbox: { status, count, callsigns }, production: { status, count, callsigns }, onlyInProduction: [...] }`.
- Ingen endringer i `safesky-beacons-fetch`, `safesky-beacons`, `safesky-advisory`, `safesky-cron-refresh`, database eller frontend.

