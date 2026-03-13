

## Automatisk dronekobling i batterilogg ved DJI-import

### Problem

Når en DJI-logg importeres, matcher systemet **både** drone og batteri korrekt. Men det opprettes aldri en `drone_equipment_history`-post — den tabellen fylles kun ved manuell kobling via "Legg til utstyr"-dialogen. Resultatet er at batteriets "Droner"-fane i loggboken forblir tom, selv om batteriet har fløyet med en bestemt drone.

### Løsning

Etter at en flylogg lagres med matchet drone og batteri, sjekk om det allerede finnes en aktiv kobling i `drone_equipment_history` for dette paret. Hvis ikke, opprett en `added`-hendelse automatisk. Dette krever **ingen databaseendringer** — bare en ny funksjon i `UploadDroneLogDialog.tsx`.

### Endringer

**`src/components/UploadDroneLogDialog.tsx`**

Legg til en hjelpefunksjon `ensureDroneEquipmentHistory` som:
1. Tar drone-ID og equipment-ID (batteri) som input
2. Sjekker om det finnes en eksisterende `added`-post uten tilhørende `removed` for dette paret
3. Hvis ikke, oppretter en ny `added`-post i `drone_equipment_history`
4. Kalles etter `updateBatteryEquipment()` i alle tre lagringsstier (oppdater eksisterende, nytt oppdrag, koble til oppdrag)

```text
saveFlightLog()
  → updateBatteryEquipment()
  → ensureDroneEquipmentHistory(droneId, batteryEquipmentId)
      ├─ SELECT siste entry for dette paret
      ├─ Hvis action='added' → gjør ingenting (allerede koblet)
      └─ Ellers → INSERT { action: 'added', drone_id, item_id, item_type: 'equipment', item_name }
```

### Filer som endres

- **`src/components/UploadDroneLogDialog.tsx`** — ny `ensureDroneEquipmentHistory`-funksjon + kalle den etter lagring

