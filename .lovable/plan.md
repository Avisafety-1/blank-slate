

## Auto-oppretting og matching av batteri fra DJI-logg

### Oversikt

Når en DJI-logg importeres og inneholder `batterySN` (serienummer), skal systemet:
1. Sjekke om det finnes et utstyr av type "Batteri" med matchende serienummer i selskapets equipment-tabell
2. **Hvis funnet**: Auto-velge batteriet i utstyrslisten (som allerede gjøres for droner via `aircraftSN`)
3. **Hvis ikke funnet**: Vise et valg til brukeren om å opprette batteriet som nytt utstyr

### Endringer

**`src/components/UploadDroneLogDialog.tsx`**

1. Etter at `result` er satt (både i `handleUpload` og `handleSelectDjiLog`), legg til batteri-matching-logikk:
   - Søk i `equipmentList` etter et utstyr der `serienummer` matcher `result.batterySN` (og type inneholder "Batteri" eller lignende)
   - Hvis match: auto-legg til i `selectedEquipment` og vis toast "Batteri matchet automatisk: [navn]"
   - Hvis ikke match og `batterySN` finnes: sett en ny state `unmatchedBatterySN` 

2. Ny state:
   - `unmatchedBatterySN: string | null` — serienummeret som ikke ble funnet
   - `showCreateBatteryPrompt: boolean` — viser prompt til brukeren

3. I result-steget, vis en info-boks når `unmatchedBatterySN` er satt:
   - Melding: "Batteriet med serienummer [SN] ble ikke funnet i ressursene. Ønsker du å opprette det?"
   - Knapper: "Opprett batteri" / "Hopp over"
   - Ved "Opprett batteri": Inserter nytt equipment med `type: "Batteri"`, `serienummer: batterySN`, `navn: "Batteri [SN]"`, og legg det automatisk til i `selectedEquipment`
   - Inkluder batterihelse, kapasitet og sykluser fra loggen i merknader-feltet

4. Etter opprettelse: Oppdater `equipmentList` lokalt og legg til det nye batteriet i `selectedEquipment`

### Matching-logikk (detalj)

Matching gjøres case-insensitive og trimmet. Typen sjekkes bredt ("Batteri", "Battery", eller at serienummeret matcher uansett type) for å fange batterier som kan ha blitt opprettet manuelt med annen type.

### Ingen database-endringer

Equipment-tabellen støtter allerede batterier som type. Ingen skjemaendringer nødvendig.

