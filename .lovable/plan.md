## Funn fra loggen

- Siste kall til `flighthub2-airspace-feed` kom fra DJI med:
  - `GET /v1/uav?lat=22.5431&lng=114.0579&radius=100`
  - `Authorization: SS-HMAC Credential=VKzc5V033o465UgIKXoZCw/v1, ...`
  - `status_returned: 401`
  - `body_preview: reason=no_match_for_credential`
- `fh2_airspace_feed_config` er tom, så endpointet har ingen lagret nøkkel å matche mot.
- `flighthub2-airspace-feed-config` har ingen nylige logs, som tyder på at admin-UI ikke faktisk kaller nøkkelgenerering/saving for feed-konfig.

## Plan

1. Koble admin-UI til feed-config-funksjonen
   - Legg inn et tydelig administrasjonsfelt under DJI/FlightHub 2-innstillinger for `Third-Party Airspace Data feed`.
   - Vis feed-URL som skal inn i FH2.
   - Legg inn knapp for å generere/rotere API-nøkkel via `flighthub2-airspace-feed-config`.
   - Vis kun ny nøkkel ved generering, slik at den kan kopieres inn i FH2.

2. Sikre at nøkkelen lagres riktig
   - Bekreft at `rotate`-kallet bruker innlogget admin-token og lagrer rad i `fh2_airspace_feed_config`.
   - Hvis nødvendig, juster backend-funksjonen slik at lagring feiler tydelig i UI med norsk feilmelding.
   - Behold kryptert lagring via `save_fh2_feed_key` og `FH2_ENCRYPTION_KEY`.

3. Gjør verifikasjonsloggen mer nyttig uten å lekke hemmeligheter
   - Ved `no_match_for_credential`, logg trygg metadata: credential-prefix/lengde og om config-tabellen har aktive rader.
   - Fortsett å maskere `Signature` i headers.

4. Deploy og verifiser
   - Deploy berørte Edge Functions.
   - Test at `rotate` oppretter config-rad.
   - Etter ny nøkkel er limt inn i FH2, sjekk om neste feil går videre fra `no_match_for_credential` til enten `signature_mismatch` eller `200 success`.

## Forventet resultat

Etter implementering må du generere ny feed-nøkkel i admin, lime akkurat den nøkkelen inn som API Key i DJI FlightHub 2 Airspace Data Configuration, og trykke Verify igjen. Da skal `no_match_for_credential` forsvinne.