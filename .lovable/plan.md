

## Plan: Knytt til eksisterende ressurs ved umatched SN

### Oversikt
Når DJI-logg ikke matcher en drone/batteri, vises i dag «Opprett» og «Hopp over». Vi legger til et tredje alternativ: «Knytt til eksisterende», som lar brukeren velge en eksisterende drone/batteri fra en dropdown. Ved valg oppdateres ressursens `internal_serial` med SN fra loggen, slik at fremtidige logger matcher automatisk.

### Endringer i `src/components/UploadDroneLogDialog.tsx`

**Ny state:**
- `linkBatteryToExisting: boolean` — viser dropdown for å velge eksisterende batteri
- `linkDroneToExisting: boolean` — viser dropdown for å velge eksisterende drone

**Batteri-prompt (linje ~1769-1791):**
- Legg til tredje knapp «Knytt til eksisterende» som setter `linkBatteryToExisting = true`
- Når `linkBatteryToExisting` er true, vis en `<Select>` med alle batterier i `equipmentList` (type Batteri)
- Ved valg: kall `supabase.from('equipment').update({ internal_serial: unmatchedBatterySN }).eq('id', valgtId)`, oppdater lokal `equipmentList` med nytt `internal_serial`, legg til i `selectedEquipment`, nullstill `unmatchedBatterySN` og `linkBatteryToExisting`

**Drone-prompt (linje ~1813-1836):**
- Legg til tredje knapp «Knytt til eksisterende» som setter `linkDroneToExisting = true`
- Når `linkDroneToExisting` er true, vis en `<Select>` med alle `drones`
- Ved valg: kall `supabase.from('drones').update({ internal_serial: unmatchedDroneSN }).eq('id', valgtId)`, oppdater lokal `drones`-state, sett `selectedDroneId`, nullstill `unmatchedDroneSN` og `linkDroneToExisting`

**Reset:** Legg til `linkBatteryToExisting` og `linkDroneToExisting` i `resetState()`.

### Berørte filer
- `src/components/UploadDroneLogDialog.tsx` (eneste fil)

