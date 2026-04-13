

## Plan: Post flight checklist ved logging av flytur

### Problem
Post-flight-sjekkliste-logikken ble kun implementert i `MissionStatusDropdown` (manuell statusendring). Når man logger flytur via `LogFlightTimeDialog` og krysser av "Marker oppdrag som fullført", oppdateres oppdraget direkte til "Fullført" uten å sjekke om dronen har en post-flight-sjekkliste. Sjekkliste-IDen legges aldri til oppdragets `checklist_ids`, så ingen badge vises på oppdragskortet.

### Løsning
Utvide `LogFlightTimeDialog` med samme post-flight-sjekklistelogikk som i `MissionStatusDropdown`:

#### 1. `LogFlightTimeDialog.tsx` — legg til post-flight-sjekkliste-flyt

Etter at flyloggen er lagret og oppdraget skal markeres som fullført (linje ~783-798):

- Hent `post_flight_checklist_id` fra valgt drone (`formData.droneId`)
- Hvis den finnes: vis en `AlertDialog` med "Utfør nå" / "Utfør senere"
  - **Utfør nå**: Åpne `ChecklistExecutionDialog`, deretter lukk dialogen
  - **Utfør senere**: Legg sjekkliste-IDen til oppdragets `checklist_ids` (men ikke `checklist_completed_ids`), slik at den vises som grå badge
- Legg også til sjekkliste-IDen til `checklist_ids` ved auto-genererte oppdrag (linje ~700-722)

Ny state som trengs:
- `postFlightPromptOpen` (boolean)
- `postFlightChecklistId` (string | null)
- `postFlightMissionId` (string | null)
- `postFlightExecOpen` (boolean)

#### 2. Også håndter tilfellet uten "marker som fullført"

Selv om brukeren ikke krysser av for å fullføre oppdraget, bør post-flight-sjekklisten likevel tilbys etter logging. Sjekklisten er knyttet til dronen, ikke oppdraget. Så prompten skal komme uansett når dronen har en `post_flight_checklist_id`.

Flyten blir:
1. Flylogg lagres (som nå)
2. Oppdrag oppdateres om valgt (som nå)
3. Sjekk om valgt drone har `post_flight_checklist_id`
4. Hvis ja → vis prompt
5. Hvis "utfør nå" → åpne `ChecklistExecutionDialog`
6. Hvis "utfør senere" og det finnes et tilknyttet oppdrag → legg til i oppdragets `checklist_ids`
7. Lukk dialogen og kall `onFlightLogged`

### Berørte filer
- `src/components/LogFlightTimeDialog.tsx` — hovedendring: post-flight-sjekkliste-prompt + execution etter submit

### Omfang
Middels — 1 fil, men krever ny state og dialog-logikk i en allerede stor komponent.

