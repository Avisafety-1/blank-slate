# SafeSky /v1/uav med viewport + X-SS-Org-Id (isolert test)

Dokumentasjonen du limte inn forklarer sannsynligvis hvorfor prod-nøkkelen svarer 404/500 i dagens diagnose: en integrasjonsnøkkel **uten** `X-SS-Org-Id`-header avvises med en generisk **404 Not Found**. Dagens probe sender ikke den headeren. I tillegg tar `/v1/uav` en `viewport`-parameter, ikke bare `lat/lng/rad`.

## Hva som gjøres (kun i testfunksjonen)

Utvid `safesky-env-compare` — ingen endring i appen, kartet og trafikkbildet forblir som i dag:

1. Ny modus `uav-viewport`: `GET https://<host>/v1/uav?viewport=lat1,lon1,lat2,lon2` med HMAC-signering som i dag, pluss headerne:
   - `X-SS-Org-Id`: stabil, opak SHA-256-hash av selskapets id (kun for test: en fast hash for Avisafe)
   - `X-SS-Org-Label`: "Avisafe" (valgfri, kun visning)
2. Kjør en trapp av viewport-størrelser sekvensielt for å finne grensen:
   - Trondheim (~0,2°) → Sør-Norge → hele Norge → dagens fulle viewport 47,0,5,0,72,0,32,0
3. For hvert kall logges: HTTP-status, antall objekter, `X-SS-Trial-Status`, `X-SS-Trial-Days-Remaining`, `X-Quota-Status`, og evt. feiltekst. Da ser vi umiddelbart om nøkkelen er en integrasjonsnøkkel på trial, en vanlig abonnementsnøkkel, eller utløpt.
4. Kontrollkall uten `X-SS-Org-Id` på samme viewport, for å bekrefte at 404 skyldes den manglende headeren.

## Skånsomt mot systemet

- Ett HTTP-kall om gangen, sekvensielt med kort pause — ingen parallelle massekall.
- Ingen skriving til databasen, ingen cron, ingen endring i dagens trafikkhenting.
- Kjøres manuelt én gang, beskyttet av eksisterende diagnose-token.

## Etterpå

Hvis stort viewport + `X-SS-Org-Id` gir treff (inkl. droneflykart-advisories), lager vi en egen plan for å supplere dagens sandbox-`/beacons` med produksjons-`/uav`, inkludert per-selskap `X-SS-Org-Id` (generert én gang, lagret permanent) og håndtering av trial-utløp i UI.

## Åpent spørsmål

Er `SAFESKY_PROD_API_KEY` en integrasjonsnøkkel (partneravtale) eller en vanlig abonnementsnøkkel? Testen over vil svare på dette via trial-headerne, så vi trenger ikke avklare det på forhånd.
