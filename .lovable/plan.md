

## Åpne AddEquipmentDialog med forhåndsutfylte verdier ved batteri-opprettelse

### Oversikt
I stedet for å auto-inserere batteriet direkte i databasen når brukeren trykker "Opprett batteri", skal `AddEquipmentDialog` åpnes med forhåndsutfylte verdier (type="Batteri", serienummer, merknader fra loggen). Brukeren kan da redigere navn, sette vedlikeholdsintervall osv. før lagring.

### Endringer

**`src/components/resources/AddEquipmentDialog.tsx`**
- Legg til valgfri prop `defaultValues?: { type?: string; serienummer?: string; navn?: string; merknader?: string }` i interfacet
- Bruk `defaultValues` til å pre-populere feltene ved mount/open (sett `selectedType`, og bruk som defaultValue på Input-feltene)
- Returnér det opprettede utstyret via en ny valgfri callback `onEquipmentCreated?: (equipment: { id: string; navn: string; serienummer: string; type: string }) => void` som kalles etter vellykket insert (i tillegg til eksisterende `onEquipmentAdded`)

**`src/components/UploadDroneLogDialog.tsx`**
- Erstatt `handleCreateBattery` (som gjør direkte insert) med logikk som åpner `AddEquipmentDialog`
- Ny state: `showAddEquipmentDialog: boolean`
- Beregn `batteryDefaultValues` fra `unmatchedBatterySN` og `result` (batteryhelse, sykluser osv. som merknader)
- Ved "Opprett batteri"-klikk: sett `showAddEquipmentDialog = true`
- Render `<AddEquipmentDialog>` med `defaultValues` og `onEquipmentCreated`-callback som:
  1. Legger det nye utstyret til `equipmentList` og `selectedEquipment`
  2. Nullstiller `unmatchedBatterySN`
  3. Lukker dialogen
- Ved dialog-lukking uten lagring: behold `unmatchedBatterySN` så brukeren kan prøve igjen eller hoppe over

