

## Plan: Internt serienummer for droner og utstyr (batterier)

### Oversikt
Legge til et nytt valgfritt felt `internal_serial` på `drones` og `equipment`-tabellene, vise det i UI-kortene, og utvide DJI-logg-importens matching-logikk til å søke på **både** `serienummer` og `internal_serial`.

### 1. Databasemigrasjon
Legg til kolonne `internal_serial text` (nullable) på begge tabeller:
```sql
ALTER TABLE public.drones ADD COLUMN internal_serial text;
ALTER TABLE public.equipment ADD COLUMN internal_serial text;
```

### 2. UI-endringer – Droner
- **DroneDetailDialog**: Legg til felt «Internt serienummer» i redigeringsmodus og visning, rett under eksisterende serienummer-felt. Oppdater `Drone`-interfacet med `internal_serial`.
- **AddDroneDialog**: Legg til inputfelt for internt serienummer. Utvid `DroneDefaultValues` med `internal_serial`. Lagre ved opprettelse.
- **DroneListDialog**: Vis internt serienummer under SN hvis det finnes.

### 3. UI-endringer – Utstyr (batterier)
- **EquipmentDetailDialog**: Legg til felt «Internt serienummer» i redigeringsmodus og visning.
- **AddEquipmentDialog**: Legg til inputfelt. Utvid `EquipmentDefaultValues` med `internal_serial`.

### 4. DJI-logg matching-logikk (`UploadDroneLogDialog.tsx`)
- **`matchDroneFromResult`**: Utvid til å søke match på `d.serienummer` ELLER `d.internal_serial` mot DJI-loggens `aircraftSN`/`aircraftSerial`.
- **`matchBatteryFromResult`**: Utvid til å søke match på `e.serienummer` ELLER `e.internal_serial` mot `batterySN`.
- **Auto-opprettelse**: Når ingen match finnes og drone/batteri opprettes som ny ressurs, sett `internal_serial` til DJI-loggens serienummer (i tillegg til `serienummer`).

### 5. Datahenting
Sikre at `internal_serial` inkluderes i alle queries som henter droner og utstyr (Resources-siden, oppdragssiden, UploadDroneLogDialog).

### Berørte filer
- Ny migrasjon (SQL)
- `src/components/resources/DroneDetailDialog.tsx`
- `src/components/resources/AddDroneDialog.tsx`
- `src/components/resources/EquipmentDetailDialog.tsx`
- `src/components/resources/AddEquipmentDialog.tsx`
- `src/components/UploadDroneLogDialog.tsx`
- `src/components/dashboard/DroneListDialog.tsx`

