

## Problem

Når en DJI-logg lastes opp for et oppdrag som allerede har en flylogg (f.eks. fra SafeSky), opprettes en **ny** flylogg i stedet for å oppdatere den eksisterende. Dette skjer fordi:

1. SHA-256 duplikatsjekken finner ingen match (SafeSky-loggen har ingen DJI-hash)
2. Systemet finner oppdraget i tidsvinduet og tilbyr «Knytt til eksisterende oppdrag»
3. `handleLinkToMission` oppretter alltid en ny `flight_logs`-rad → 2 flylogger på samme oppdrag

Den andre loggen får tidspunkt 01:00 fordi DJI-loggens startTime ble feilparsed eller brukt direkte som flight_date.

## Løsning

Utvid `findMatchingFlightLog` til å søke etter eksisterende flylogger på matchede oppdrag. Hvis en flylogg allerede finnes på oppdraget (innenfor tidsvinduet), sett `matchedLog` slik at brukeren får «Oppdater eksisterende»-knappen i stedet for «Opprett ny».

### Endringer

**`src/components/UploadDroneLogDialog.tsx`** — i `findMatchingFlightLog`:

Etter at matchede oppdrag er funnet (linje ~860-870), legg til et ekstra steg:

1. Hent flight_logs for de matchede oppdragene: `SELECT id, flight_date, flight_duration_minutes, drone_id, mission_id FROM flight_logs WHERE mission_id IN (matched_mission_ids)`
2. Hvis en eller flere flylogger finnes, sorter etter nærmest flytidspunkt og sett `setMatchedLog(closestLog)` — dette gjør at UI-en automatisk viser «Oppdater eksisterende flylogg» i stedet for å opprette en ny
3. Pre-select oppdraget via `setSelectedMissionId`

Resultatet: Når brukeren laster opp DJI-loggen, ser de «Eksisterende flylogg funnet!» med mulighet til å oppdatere (legge til flight_track, DJI-metadata osv.) i stedet for å opprette duplikat.

### Fil
- `src/components/UploadDroneLogDialog.tsx`

