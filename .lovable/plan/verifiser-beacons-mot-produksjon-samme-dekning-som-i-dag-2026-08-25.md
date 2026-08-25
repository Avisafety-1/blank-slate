# Verifiser /beacons mot produksjon (samme dekning som i dag)

## Hva vi vet så langt

- Dagens trafikkbilde kommer fra `sandbox-public-api.safesky.app/v1/beacons` med viewport `47.0,5.0,72.0,32.0` (Norge, Norden, Tyskland, Polen) — `safesky-beacons-fetch`.
- Forrige test viste at `uav-api.safesky.app/v1/uav` med `SAFESKY_PROD_API_KEY` svarer 200 og har mer trafikk enn sandbox, mens `public-api.safesky.app` svarer 500 «Access is denied».
- Vi har **ikke** testet `/v1/beacons` mot produksjonshosten ennå, og vet derfor ikke om produksjon dekker hele viewporten vi bruker i dag. Det er nettopp det denne testen skal svare på.

## Slik tester vi (fortsatt uten å påvirke Avisafe)

Utvider den eksisterende, isolerte diagnosefunksjonen `safesky-env-compare`. Ingen databaseskriving, ingen endring i kartet, ingen ekstra last på dagens innhenting.

1. Legger til modus `endpoint: "beacons"` som kaller `GET /v1/beacons?viewport=…&return_grounded_traffic=true` mot både sandbox og `uav-api.safesky.app`.
2. Kjører først med **nøyaktig samme viewport som i dag** (`47.0,5.0,72.0,32.0`) og sammenligner antall beacons, kildefordeling og hvilke callsign som finnes bare i produksjon.
3. Kjører deretter et par mindre delviewporter (Norge, Sverige/Finland, Tyskland/Polen) for å se om produksjon eventuelt begrenser dekning geografisk eller kutter svaret på antall.
4. Du får en tabell i chatten: status, antall og dekning per miljø og område. Først når det er bekreftet at produksjon dekker minst like mye som sandbox, lager vi en egen plan for å bytte selve innhentingen.

Hvis produksjon svarer 401/403/500 på `/beacons`, er det abonnementet hos SafeSky som må utvides — og ingenting i appen er endret.

## Teknisk

- Kun `supabase/functions/safesky-env-compare/index.ts` endres:
  - Body: `{ endpoint?: "uav" | "beacons", viewport?: string }`, default beacons-viewport = dagens `47.0,5.0,72.0,32.0`.
  - Bruker eksisterende `_shared/safesky-hmac.ts` + `x-api-key`, og `safeFetch` med allowlist `sandbox-public-api.safesky.app`, `uav-api.safesky.app`, `public-api.safesky.app`.
  - Returnerer per miljø: `status`, `count`, fordeling på `source`/`beacon_type`, bounding box for mottatte posisjoner, og `onlyInProduction`-callsign (begrenset liste).
  - Fortsatt superadmin- eller `x-diag-token`-beskyttet, fortsatt uten DB-kall.
- Ingen endringer i `safesky-beacons-fetch`, `safesky-beacons`, `safesky-advisory`, `safesky-cron-refresh`, database eller frontend.
