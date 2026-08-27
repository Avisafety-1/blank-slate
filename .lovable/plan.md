# Ny SafeSky-nøkkel for public beacons-APIet — lagring og test

## Mål

Lagre den nye produksjonsnøkkelen fra SafeSky som en hemmelighet, og teste den isolert mot `public-api.safesky.app/v1/beacons` før vi eventuelt tar den i bruk i den automatiske hentingen.

## Steg

1. **Lagre nøkkelen som secret** — vi åpner et sikkert skjema (add_secret) der du limer inn nøkkelen. Foreslått navn: `SAFESKY_BEACONS_PROD_API_KEY` (beskrivende og unikt, siden `SAFESKY_BEACONS_API_KEY` allerede brukes til sandbox-nøkkelen). Nøkkelen vises aldri i chat eller kode.
2. **Test nøkkelen isolert** — vi utvider diagnosefunksjonen `safesky-env-compare` (samme mønster som tidligere SafeSky-tester) med en probe som kaller `public-api.safesky.app/v1/beacons` med den nye nøkkelen, både med `x-api-key` og med HMAC-signering, mot dagens viewport `47.0,5.0,72.0,32.0`.
3. **Rapporter resultatet** — per kombinasjon: HTTP-status, antall beacons og eventuell feilmelding, slik at vi ser om nøkkelen virker og gir trafikk.

## Viktig avgrensning

- Ingen endring i `safesky-beacons-fetch` eller kartet ennå — den kjører fortsatt mot sandbox med dagens nøkkel. Vi bytter ikke over til produksjon før testen viser at nøkkelen fungerer, og før du sier ja til det.
- Kun lesing: ingen databaseskriving utenom det diagnosen allerede gjør.

## Teknisk

- `secrets--add_secret` for sikker inntasting av nøkkelen.
- Endring kun i `supabase/functions/safesky-env-compare/index.ts`: to nye probe-kall (`x-api-key` og HMAC) mot `public-api.safesky.app` med den nye secret-en. Allowlisten må tillate `public-api.safesky.app` (allerede tillatt fra tidligere tester).
- Test kjøres via edge-funksjonskallet én gang, ikke i løkke.
