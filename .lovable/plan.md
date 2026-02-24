

# Feature: Loggbok-integrasjon i Last opp flylogg-dialogen

## Oversikt

Utvide `UploadDroneLogDialog` med et nytt steg/seksjon i result-visningen som lar brukeren konfigurere hva som skal logges i loggbokene til pilot, drone og utstyr -- med smarte standardvalg basert på data fra flyloggen og matchende oppdrag.

## Tekniske endringer

**Fil: `src/components/UploadDroneLogDialog.tsx`**

### 1. Ny state og data

Legg til state for loggbok-konfigurasjon:

```typescript
// Ny state
const [pilotId, setPilotId] = useState<string>("");
const [personnel, setPersonnel] = useState<Personnel[]>([]);
const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
const [logToLogbooks, setLogToLogbooks] = useState(true);
const [warningActions, setWarningActions] = useState<Record<number, { saveToLog: boolean; newStatus: string }>>({});
```

Interface for personell (samme moenster som `LogFlightTimeDialog`):

```typescript
interface Personnel { id: string; full_name: string | null; email: string | null; }
interface EquipmentItem { id: string; navn: string; serienummer: string; }
```

### 2. Hent personell og utstyr

Utvid `useEffect` ved `open` til ogs aa hente:
- `profiles` (godkjente, samme selskap) for pilotvelger
- `equipment` (aktive) for utstyrsvelger
- Auto-sett `pilotId` til innlogget bruker

Hvis matchet oppdrag har tilknyttet drone/utstyr/personell via `mission_drones`, `mission_equipment`, `flight_log_personnel` og `flight_log_equipment`, pre-select disse automatisk.

### 3. Auto-match drone og utstyr

Eksisterende SN-match for drone beholdes. I tillegg: hvis matchende oppdrag (`matchedLog`) har `drone_id`, pre-select den. Hvis oppdragets `flight_log_equipment` entries finnes, pre-select det utstyret.

### 4. Ny UI-seksjon: "Loggbok-oppdatering"

Plasseres i result-steget, mellom KPI-visningen og warnings/footer. Vises som en sammenklappbar seksjon med Switch for "Oppdater loggboeker".

Inneholder:

**a) Pilot-velger**
- Select med alle godkjente profiler i selskapet
- Innlogget bruker forhåndsvalgt
- Viser hvem som er valgt

**b) Drone-velger**  
- Allerede eksisterende `selectedDroneId` gjenbrukes
- Viser auto-match info (SN)

**c) Utstyr-velger**
- Checkbox-liste over tilgjengelig utstyr (samme moenster som `LogFlightTimeDialog`)
- Pre-selectet fra matchende oppdrag

**d) Sammendrag av hva som logges**
- Kompakt oppsummering:
  - "Pilot: [navn] +[X] min flytid"
  - "Drone: [modell] +[X] min flytid" 
  - "Utstyr: [navn1], [navn2] +[X] min flytid"

### 5. Warning-handlinger

For hver warning i `result.warnings`, vis valg:
- Checkbox: "Lagre som loggbokoppfoering paa dronen" (default: true for alvorlige)
- Dropdown: "Endre dronestatus" med valg Groen/Gul/Roed (default: Gul)

For spesifikke warnings (celleavvik, lav batterihelse):
- Automatisk foreslaa lagring i droneloggbok med passende tittel

### 6. Oppdater save-logikken

I `handleUpdateExisting` og `handleCreateNew`:

- Opprett `flight_log_personnel` entry for valgt pilot (og evt. andre)
- Opprett `flight_log_equipment` entries for valgt utstyr (trigger oppdaterer flyvetimer automatisk)
- Oppdater pilot-profil `flyvetimer` 
- Oppdater drone `flyvetimer` (allerede eksisterende)
- For warnings: bruk brukerens valg for status (Gul/Roed) i stedet for alltid Gul
- For warnings: lagre loggbokoppfoering kun hvis brukeren har valgt det

### 7. Eksisterende `handleWarnings`-funksjon

Refaktorer til aa bruke `warningActions`-state i stedet for hardkodet oppforsel. Dagens kode setter alltid status til Gul og lager alltid loggbokinnlegg -- ny kode bruker brukerens valg per warning.

## Filendringer

Kun **en fil** endres: `src/components/UploadDroneLogDialog.tsx`

- ~100 linjer ny state/fetch-logikk
- ~80 linjer ny UI-seksjon 
- ~30 linjer oppdatert save-logikk
- ~20 linjer refaktorert warning-handling

Totalt ~230 linjer endringer/tillegg i en fil paa 998 linjer.

