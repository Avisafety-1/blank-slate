

## Gjor oppdragskort klikkbare i Oppfolging-fanen

### Hva endres
Oppdragskortene i "Oppfolging"-fanen i profildialogen blir klikkbare slik at man kan se hele oppdraget med risikovurdering, kart, varvarsler osv. via den eksisterende `MissionDetailDialog`.

### Endringer

**Fil: `src/components/ProfileDialog.tsx`**

1. Importere `MissionDetailDialog` fra `./dashboard/MissionDetailDialog`
2. Legge til state for valgt oppdrag og dialog-synlighet (`selectedMission`, `missionDetailOpen`)
3. Utvide dataene som hentes for pending missions til a inkludere alle felter som MissionDetailDialog trenger (latitude, longitude, route, beskrivelse, merknader, weather_data_snapshot) samt AI-risikovurdering fra `mission_risk_assessments`
4. Gjore selve oppdragskortet klikkbart (cursor-pointer, hover-effekt) - klikk apner MissionDetailDialog med full oppdragsinformasjon
5. Godkjenn-knappen forblir pa kortet og stopper event-propagation sa den ikke apner dialogen
6. Legge til `MissionDetailDialog`-komponenten i renderingen

### Teknisk detalj

- Queryen for pending missions utvides fra `.select("id, tittel, lokasjon, tidspunkt, status, beskrivelse")` til `.select("*")` for a fa med alle felter
- AI-risikovurdering hentes separat fra `mission_risk_assessments` og legges til som `aiRisk`-property (samme monster som i MissionsSection)
- Klikk pa kortet setter `selectedMission` og apner dialogen
- Godkjenn-knappen bruker `e.stopPropagation()` for a unnga at dialogen apnes samtidig
