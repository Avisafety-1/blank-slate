# Test /v1/uav med stor viewport (isolert)

Dagens diagnose kaller `/v1/uav` med `lat/lng/rad`. SafeSky-dokumentasjonen viser at endepunktet også tar `viewport=lat1,lon1,lat2,lon2`. Vi vet ikke om produksjons-API-et tillater et stort viewport — det må testes før vi vurderer å bruke det i appen.

## Hva som gjøres

Utvid kun test-funksjonen `safesky-env-compare` (ingen endring i appen, kartet og trafikkbildet forblir som i dag):

1. Ny modus `uav-viewport` som kaller `https://uav-api.safesky.app/v1/uav?viewport=...` med produksjonsnøkkelen.
2. Kjør en trapp av viewport-størrelser, ett kall om gangen, for å finne hvor grensen går:
   - Lite: Trondheim-området (~0,2°)
   - Middels: Sør-Norge
   - Stort: Norge (57,0 – 72,0 / 4,0 – 32,0)
   - Fullt: dagens trafikk-viewport 47,0,5,0,72,0,32,0
3. Logg for hvert kall: HTTP-status, antall objekter, evt. feilmelding, og om svaret ser avkortet ut (samme antall på flere størrelser = serverside-begrensning).

## Skånsomt mot systemet

- Ett HTTP-kall per størrelse, sekvensielt med kort pause — ingen parallelle massekall.
- Ingen skriving til databasen, ingen cron, ingen endring i eksisterende trafikkhenting.
- Kjøres manuelt én gang på forespørsel.

## Etterpå

Hvis stort viewport gir treff (inkl. droneflykart-advisories fra live.safesky.app), lager vi en oppfølgingsplan for å supplere dagens sandbox-`/beacons` med produksjons-`/uav` — uten å miste dagens dekning.
