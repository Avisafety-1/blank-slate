# Test: public-api.safesky.app/v1/beacons med sandbox-nøkkel

## Bakgrunn

Diagnosefunksjonen `safesky-env-compare` har allerede en beacons-modus som blant annet prøver produksjonshosten `public-api.safesky.app/v1/beacons` med sandbox-nøkkelen (`SAFESKY_BEACONS_API_KEY`) via `x-api-key`. Den kombinasjonen er kjørt, men vi mangler et tydelig, isolert svar på om den gir trafikk — og vi har ikke prøvd samme kombinasjon med HMAC-signering.

## Hva vi gjør

1. Legger til to varianter i beacons-modusen:
   - `public-api.safesky.app/v1/beacons` med sandbox-nøkkel + HMAC-headere (i dag prøves bare `x-api-key`).
   - `sandbox-public-api.safesky.app/v1/beacons` med produksjonsnøkkel (kryss-test motsatt vei).
2. Kjører ett kall med dagens viewport `47.0,5.0,72.0,32.0` og rapporterer per kombinasjon: HTTP-status, antall beacons, bounding box og feilmelding.
3. Presenterer resultatet som en tabell i chatten, slik at vi ser om produksjonshosten i det hele tatt aksepterer beacons-trafikk med noen av nøklene våre.

Alt er lesing: ingen databaseskriving, ingen endring i kartet, og `safesky-beacons-fetch` fortsetter uendret mot sandbox.

## Teknisk

- Kun `supabase/functions/safesky-env-compare/index.ts` endres — to nye `probeBeacons`-kall i beacons-grenen.
- Fortsatt beskyttet av superadmin-sjekk eller `x-diag-token`, allowlist uendret (`sandbox-public-api`, `public-api`, `uav-api`).
- Ett kall per kombinasjon, kjørt parallelt én gang — ingen løkker, ingen ekstra last.
