

## Analyse

SafeSky sandbox API-belastning er minimal: **1 kall per 10s** uansett antall brukere = 6/min = 360/time. Det er langt under rimelige API-kvoter. Problemet er ikke belastning, men at beacons-cachen er tom når brukeren åpner kartet fordi ingen heartbeat finnes før kartet er montert.

## Løsning

Flytt heartbeat-sending fra `OpenAIPMap.tsx` (kun aktiv på /kart) til app-nivå slik at den kjører når brukeren er innlogget og aktiv i appen. Edge-funksjonen trenger ingen endring — den sjekker allerede `map_viewer_heartbeats`-tabellen.

### Endringer

**1. Ny hook: `src/hooks/useAppHeartbeat.ts`**
- Sender upsert til `map_viewer_heartbeats` hvert 30. sekund mens bruker er innlogget
- Stopper ved utlogging eller tab-skjuling (valgfritt: pause ved `visibilitychange`)
- Sletter heartbeat ved unmount
- Gjenbruker eksisterende tabell, ingen DB-endring nødvendig

**2. `src/App.tsx`** (eller layout-komponent)
- Kall `useAppHeartbeat()` på app-nivå, innenfor AuthContext

**3. `src/components/OpenAIPMap.tsx`**
- Fjern heartbeat-logikken (sendHeartbeat, deleteHeartbeat, setInterval) — dette håndteres nå av app-hooken
- Behold SafeSky manager-oppstart som før

Ingen endring i edge-funksjonen eller databasen. Resultatet er at beacons fylles i cachen så lenge noen bruker appen, og er klare når kartet åpnes.

