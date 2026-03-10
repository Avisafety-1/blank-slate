

## Bekreftelsesdialog for vedlikehold uten sjekkliste

### Hva
Når bruker klikker "Utfør inspeksjon" (drone) eller "Utfør vedlikehold" (utstyr) **uten tilknyttet sjekkliste**, skal en bekreftelsesdialog vises i stedet for å utføre handlingen direkte. Dette gjelder tre steder:

### Endringer

**1. `src/components/resources/DroneDetailDialog.tsx`** (linje 721-747)
- Legg til state `confirmInspectionOpen` (boolean)
- Når `!drone.sjekkliste_id`: sett `confirmInspectionOpen = true` i stedet for å kjøre `performDroneInspection` direkte
- Legg til en `AlertDialog` med tekst: "Er du sikker på at du vil registrere inspeksjon for {drone.modell}?" og knappene "Avbryt" / "Bekreft"
- "Bekreft" kjører den eksisterende inspeksjonslogikken

**2. `src/components/resources/EquipmentDetailDialog.tsx`** (linje 220-231)
- Legg til state `confirmMaintenanceOpen` (boolean)
- `handlePerformMaintenance`: når `!equipment.sjekkliste_id`, sett `confirmMaintenanceOpen = true` i stedet for `performMaintenanceUpdate()`
- Legg til `AlertDialog`: "Er du sikker på at du vil registrere vedlikehold for {equipment.navn}?"
- "Bekreft" kjører `performMaintenanceUpdate()`

**3. `src/pages/Kalender.tsx`** (linje 414-428)
- Legg til state `confirmCalendarMaintenance` og `pendingConfirmEvent`
- `handleMarkMaintenanceComplete`: når `!event.checklistId`, sett state i stedet for å kalle `performMaintenanceUpdate` direkte
- Legg til `AlertDialog`: "Er du sikker på at du vil markere vedlikehold som utført for {event.title}?"
- "Bekreft" kjører `performMaintenanceUpdate(pendingConfirmEvent)`

### UI
Bruker eksisterende `AlertDialog` fra `@radix-ui/react-alert-dialog` (allerede i prosjektet). Konsistent design på tvers av alle tre steder.

