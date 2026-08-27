# Kjør SafeSky-beacons-testen uten superadmin-innlogging

## Hvorfor kom 401

Testfunksjonen `safesky-env-compare` er en diagnosefunksjon som kan lese ut hvordan API-nøklene våre oppfører seg, så den har en egen dørvakt i koden: den godtar enten en innlogget Avisafe-superadmin, eller en intern diagnosetoken i headeren `x-diag-token` (verdien i `SAFESKY_COMPARE_TOKEN` eller `CRON_SHARED_SECRET`).

Det er ikke SafeSky som krever innlogging — det er vår egen funksjon. Tidligere kjøringer gikk gjennom fordi de brukte diagnosetokenen (eller en aktiv superadmin-økt). Jeg kan ikke lese ut verdien av eksisterende hemmeligheter, derfor traff jeg vakten og fikk 401.

## Slik løser vi det

1. Sette en fersk, midlertidig verdi på `SAFESKY_COMPARE_TOKEN` (jeg setter den selv, ingen innliming fra deg).
2. Kalle `safesky-env-compare` med `x-diag-token` og modus `beacons-prod-key`, som tester den nye nøkkelen mot `public-api.safesky.app/v1/beacons` med både `x-api-key` og HMAC, pluss en sandbox-kontroll.
3. Rapportere per kombinasjon: HTTP-status, antall beacons og eventuell feilmelding.
4. Rotere `SAFESKY_COMPARE_TOKEN` til en ny tilfeldig verdi etterpå, slik at den midlertidige verdien ikke blir liggende som en gyldig snarvei.

Alternativt kan du bare logge inn i preview-vinduet som superadmin, så kjører jeg testen med økten din og hopper over steg 1 og 4. Si ifra hvis du foretrekker det.

## Avgrensning

- Ingen endring i `safesky-beacons-fetch`, kartet eller databasen. Kun lesende testkall mot SafeSky.
- Ingen endring i selve dørvakt-logikken i funksjonen — vi bruker den mekanismen som allerede finnes.
