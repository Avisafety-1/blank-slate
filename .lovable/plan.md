

## Fiks FlightHub 2 token-validering -- trim + verbose request-logging

### Analyse

1. "Tilkoblet!" var basert KUN på `system_status` som krever ingen autentisering (`security: []` i DJI-spesifikasjonen). Tokenet ble aldri verifisert.
2. `list-projects` er det første kallet som faktisk validerer `X-User-Token`, og det returnerer `401`.
3. `.trim()` ble aldri lagt til på tokenet -- whitespace/newlines fra kopiering kan bryte headeren.
4. Vi har ingen logging av nøyaktig hva som sendes til DJI (header-verdier, token-lengde etter trim).

### Plan

**Edge function (`flighthub2-proxy/index.ts`)**:

1. Legg til `.trim()` på `fh2Token` rett etter den hentes fra databasen
2. Logg nøyaktig request til DJI for `list-projects`:
   - Token-lengde, første 8 og siste 4 tegn (for å verifisere at det er riktig token uten whitespace)
   - Alle header-nøkler som sendes
   - Full URL
   - DJI response headers (for å se om det er rate-limiting, IP-info, etc.)
3. Sjekk om tokenet inneholder `Bearer ` prefix (noen kopierer hele Authorization-headeren)
4. Legg til `prj_authorized_status=project-status-authorized` parameter i list-projects URL (dokumentasjonen viser dette som et filter for prosjekter brukeren har tilgang til)

### Filer som endres
1. `supabase/functions/flighthub2-proxy/index.ts` -- trim token, verbose request/response logging

