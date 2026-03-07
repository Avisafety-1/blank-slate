
Status nå (hva som faktisk skjedde)
- Nei, denne synken lyktes ikke ennå.
- Siste kjøring av `dji-auto-sync` (16:12:14Z) ga: `synced: 0`, `errors: 1`.
- Feilen i edge-loggene er: `Login failed ... 429` + `Rate limited, stopping sync for this company`.
- `pending_dji_logs` er fortsatt tom, derfor vises ingenting i «logger til behandling».

Implementasjonsplan (for å gjøre dette tydelig og robust)
1) Rett resultatmeldingen i UI
- Oppdater «Sync nå»-toast i `UploadDroneLogDialog.tsx` til å bruke `data.synced` (ikke `data.processed`).
- Vis også `data.errors` i meldingen, så brukeren ser forskjell på «0 funnet» vs «0 pga feil».

2) Gi bedre feildetaljer fra edge-funksjonen
- Utvid `dji-auto-sync`-responsen med tydelig årsak ved 429 (rate limit), f.eks. `rate_limited: true`, `upstream_status`, `details`.
- Returner per-selskap/per-bruker årsak i `companies[].details` når login/list/download stopper på 429.

3) Bedre UX ved rate limit
- Legg til `isSyncing` + disable på «Sync nå»-knappen under kall.
- Ved 429: vis warning-toast med «vent litt og prøv igjen», og legg inn kort cooldown (f.eks. 15s) før nytt forsøk.

4) Sørg for at «logger til behandling» oppdateres med en gang
- Etter vellykket sync, trigge refetch av `pending_dji_logs` i dialogen slik at nye logger vises uten å lukke/åpne dialogen.

5) Verifisering (end-to-end)
- Vent noen minutter (for å komme ut av 429-vinduet), trykk «Sync nå» én gang.
- Bekreft at toast viser riktige tall (`synced/errors`) og årsak ved feil.
- Bekreft at nye rader dukker opp i «Ventende flylogger fra auto-sync» når sync lykkes.

Tekniske detaljer
- Rotårsak nå er ikke parsing/datatype lenger, men ekstern API-rate-limit (HTTP 429 ved DJI-login).
- Det finnes også en UI-avvik: frontend leser `processed`, mens edge-funksjonen returnerer `synced`.
