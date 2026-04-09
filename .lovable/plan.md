

## Legg til "Send til FH2" i oppdragsmenyen

### Oversikt

Endre "Eksporter KMZ"-menypunktet i "Flere valg"-dropdownen på `/oppdrag` til en undermeny med to valg: lagre til dokumenter eller sende til FlightHub 2. FH2-valget er kun synlig når selskapet har en aktiv FH2-tilkobling. Dronemodellen autofylles fra oppdragets tilknyttede drone.

### Endringer

**1. `src/components/oppdrag/MissionCard.tsx`**
- Erstatt "Eksporter KMZ"-menypunktet med en sub-menu (DropdownMenuSub) som har to valg:
  - "Lagre til dokumenter" -- kaller eksisterende `onExportKmz`
  - "Send til FlightHub 2" -- kaller ny callback `onSendToFH2`
- "Send til FlightHub 2" vises kun når `hasFh2Connection` prop er `true`
- Legg til ny prop `onSendToFH2: (mission: Mission) => void` og `hasFh2Connection: boolean`

**2. `src/pages/Oppdrag.tsx`**
- Ved oppstart, sjekk om selskapet har FH2-credentials (`company_fh2_credentials`-tabellen)
- Legg til state for FH2-dialogen (`fh2DialogOpen`, `fh2Mission`)
- Når bruker velger "Send til FH2":
  - Hent oppdragets tilknyttede drone fra `mission.drones[0]?.drones?.modell`
  - Bygg route-data fra `mission.route`
  - Åpne `FlightHub2SendDialog` med `droneModelName` autofylt
- Importer og render `FlightHub2SendDialog`

**3. `src/components/FlightHub2SendDialog.tsx`**
- Liten justering: godta valgfritt `routeName` prop for å forhåndsfylle med oppdragstittel

### Drone-autofyll

Oppdrag har allerede `mission.drones` med `drones.modell` (f.eks. "DJI Matrice 30T"). `FlightHub2SendDialog` bruker allerede `matchDjiDroneModel(droneModelName)` for å mappe til riktig DJI enum-verdi. Vi sender `mission.drones[0]?.drones?.modell` som `droneModelName`.

### Filer som endres
1. `src/components/oppdrag/MissionCard.tsx` -- sub-meny for KMZ-eksport
2. `src/pages/Oppdrag.tsx` -- FH2-dialog, credentials-sjekk, drone-mapping
3. `src/components/FlightHub2SendDialog.tsx` -- valgfri `routeName` prop

