## Plan

### 1. Lagre koordinater sikkert når adresse velges
- I `AddMissionDialog` skal valgt autocomplete-adresse alltid gi `latitude` og `longitude` i insert/update payload.
- Bruk `nullish coalescing` mot første rutepunkt kun som fallback, slik at `0` ikke behandles som manglende verdi.
- Før lagring legges det inn en liten safety net: hvis `lokasjon` er satt, men koordinater mangler og ingen rute finnes, geocodes adressen én gang via Kartverket før oppdraget lagres.

### 2. Få oppdragskortet til å vise varsler for punkt-oppdrag
- I `MissionCard` brukes allerede `mission.latitude ?? routeCoords?.[0]?.lat` og `mission.longitude ?? routeCoords?.[0]?.lng`.
- Jeg vil justere dette til en delt “effective mission position”-beregning som eksplisitt støtter oppdrag uten rute, og sørge for at `AirspaceWarnings` kalles med `routePoints={undefined}` når det bare finnes ett punkt/adresse.
- Da kjører samme `check_mission_airspace` RPC for enkeltpunkt som for rute.

### 3. Sørg for at kortet oppdateres etter opprettelse
- Etter lagring fra `/oppdrag` skal listen hentes på nytt slik den gjør i dag, men jeg vil sikre at `createdMission`/oppdatert mission inneholder de nye koordinatene før kortet rendres.
- Hvis `onMissionAddedWithData` brukes i denne flyten, sendes mission med endelige koordinater videre.

### 4. Behold AI-risikovurdering/vær som følge av samme koordinater
- Når oppdraget har `latitude`/`longitude`, fungerer `DroneWeatherPanel`, `AirspaceWarnings` og `ai-risk-assessment` uten ekstra backend-endring.
- Jeg legger ikke inn nye DB-tabeller eller migrasjoner.

### Verifisering
- Opprett oppdrag fra `/oppdrag`.
- Velg en autocomplete-adresse, ikke tegn rute.
- Lagre.
- Oppdragskortet skal vise vær, kart og luftromsadvarsler basert på adressens koordinater.
- Kjør risikovurdering og bekreft at vær/luftrom bruker samme punkt.