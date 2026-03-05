

## Drone-matching med «Opprett drone»-dialog fra flylogg-import

### Oversikt
Samme mønster som batteri: når en DJI-logg inneholder et drone-serienummer som ikke matcher noen eksisterende drone, vises en prompt med «Opprett drone»-knapp som åpner `AddDroneDialog` med forhåndsutfylte verdier (serienummer, modellnavn fra loggen).

### Endringer

**`src/components/resources/AddDroneDialog.tsx`**
- Legg til valgfri prop `defaultValues?: { modell?: string; serienummer?: string; merknader?: string }`
- Legg til valgfri callback `onDroneCreated?: (drone: { id: string; modell: string; serienummer: string }) => void`
- Ved `open` + `defaultValues`: pre-populer `modell`, `merknader`, og serienummer-feltet
- Etter vellykket insert: kall `onDroneCreated` med den nye dronen (fra `.select().single()` responsen)

**`src/components/UploadDroneLogDialog.tsx`**
- Ny state: `unmatchedDroneSN: string | null`, `showAddDroneDialog: boolean`
- Ny funksjon `matchDroneFromResult(data)` — identisk mønster som `matchBatteryFromResult`:
  - Matcher `aircraftSN`/`aircraftSerial` mot `drones`-listen (trim, case-insensitive)
  - Ved match: sett `selectedDroneId` + toast
  - Ved ingen match: sett `unmatchedDroneSN`
- Erstatt eksisterende inline drone-matching i `handleUpload` og `handleSelectDjiLog` med kall til `matchDroneFromResult`
- Beregn `droneDefaultValues` fra result: `{ modell: result.aircraftName || result.droneType, serienummer: unmatchedDroneSN, merknader: 'Importert fra DJI-logg' }`
- Render «Ukjent drone»-prompt (amber boks med Plane-ikon) rett under drone-selectoren, med «Opprett drone» og «Hopp over»-knapper — identisk layout som batteri-prompten
- Render `<AddDroneDialog>` med `defaultValues` og `onDroneCreated`-callback som:
  1. Legger dronen til `drones`-listen
  2. Setter `selectedDroneId` til den nye dronen
  3. Nullstiller `unmatchedDroneSN`
  4. Lukker dialogen
- Reset `unmatchedDroneSN` og `showAddDroneDialog` i `resetState()`
- Import `AddDroneDialog` øverst i filen

