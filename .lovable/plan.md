## Problem
Klienten kaller `send-notification-email` med `type: 'notify_flight_alert'` etter ardupilot-lagring. Kildekoden støtter denne typen (linje 25 + handler på linje 193), men den deployede edge-funksjonen er en eldre versjon som ikke kjenner typen → returnerer `400 Unsupported type: notify_flight_alert`.

## Fiks
Redeploye `send-notification-email` edge-funksjonen slik at den oppdaterte koden (med `notify_flight_alert` i `COMPANY_SCOPED_TYPES`) blir aktiv.

Ingen kodendringer, ingen DB-endringer.

## Steg
1. `supabase--deploy_edge_functions(["send-notification-email"])`
2. Bekreft i edge-logger at neste lagring ikke gir 400.