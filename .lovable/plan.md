# Hent SafeSky-trafikk fra produksjon, ikke sandbox

## Hva vi vet

Innhenting av trafikk (det som tegnes i kartet) går mot SafeSky sitt **sandbox**-miljø:

- `supabase/functions/safesky-beacons-fetch/index.ts` henter fra `sandbox-public-api.safesky.app/v1/beacons` (host er også låst i SSRF-allowlisten).
- `supabase/functions/safesky-beacons/index.ts` henter fra `sandbox-public-api.safesky.app/v1/uav`.

Publisering av våre egne advisories går derimot mot **produksjon**:

- `supabase/functions/safesky-advisory/index.ts` bruker `uav-api.safesky.app/v1/advisory` med `SAFESKY_PROD_API_KEY` når den finnes (den er konfigurert i prosjektet).

Det forklarer det du ser: våre advisories havner i live SafeSky (og synes i droneflykart), mens vi leser trafikk fra sandbox — og en advisory fra droneflykart i live-miljøet finnes rett og slett ikke i sandbox-svaret. Det er altså miljøforskjell, ikke en nøkkelbegrensning i seg selv. (Ubekreftet inntil vi har kjørt et faktisk kall mot produksjons-endepunktet — det er første steg.)

## Slik gjør vi det

1. Verifiser mot SafeSky produksjon: kall beacons/UAV-endepunktet med produksjonsnøkkelen og sjekk at trafikken fra det aktuelle området (inkl. droneflykart-advisoryen) kommer med. Sammenlign svaret med sandbox for samme viewport.
2. Bytt innhentingen til produksjon når verifiseringen er grønn:
   - `safesky-beacons-fetch`: produksjonshost + `SAFESKY_PROD_API_KEY`, med fallback til sandbox hvis produksjonsnøkkel mangler. Legg produksjonshosten i `safeFetch`-allowlisten.
   - `safesky-beacons`: samme bytte for `/v1/uav`.
3. Gjør miljøvalget til én felles konstant/hjelper slik at lesing og publisering ikke kan sprike igjen.
4. Test på nytt: kjør funksjonen, se at beacons lagres, og sjekk at trafikken dukker opp i kartet.

Hvis produksjonskallet feiler (401/403), er det nøkkelen/abonnementet hos SafeSky som må utvides — da rapporterer vi det tilbake med feilmeldingen i stedet for å bytte miljø.

## Teknisk

- Ny delt fil `supabase/functions/_shared/safesky-env.ts` med host- og nøkkelvalg (`SAFESKY_PROD_API_KEY` → produksjon, ellers `SAFESKY_API_KEY` → sandbox).
- `safesky-beacons-fetch/index.ts`: `SAFESKY_HOST`, `SAFESKY_BEACONS_URL` og allowlist-arrayet leses fra hjelperen; nøkkelrekkefølgen blir prod → `SAFESKY_BEACONS_API_KEY` → `SAFESKY_API_KEY`.
- `safesky-beacons/index.ts`: samme host/nøkkelvalg for `/v1/uav`.
- `safesky-advisory/index.ts`: bruker hjelperen for `SAFESKY_UAV_URL` slik at live-posisjoner og lesing er i samme miljø.
- Ingen databaseendringer, ingen frontend-endringer.
