

## Knytte personell og utstyr til oppdrag ved DJI-logg import

### Problem
Når man oppretter eller kobler et oppdrag fra DJI-logg, lagres kun dronen til `mission_drones`. Valgt personell og utstyr lagres bare i flylogg-tabellene (`flight_log_personnel`, `flight_log_equipment`), men ikke i oppdragets ressurs-tabeller (`mission_personnel`, `mission_equipment`). Derfor vises de ikke på oppdragskortet.

### Endringer

**`src/components/UploadDroneLogDialog.tsx`**

**1. `handleCreateAndSave` (ny mission, ~linje 920-938)**
Etter eksisterende drone-insert (linje 922), legg til:
- Insert valgt pilot til `mission_personnel` hvis `pilotId` finnes
- Insert valgt utstyr til `mission_equipment` for hvert element i `selectedEquipment`

```typescript
// Etter linje 922 (mission_drones insert)
if (mission && pilotId) {
  await supabase.from('mission_personnel').insert({ mission_id: mission.id, profile_id: pilotId });
}
if (mission && selectedEquipment.length > 0) {
  await supabase.from('mission_equipment').insert(
    selectedEquipment.map(eqId => ({ mission_id: mission.id, equipment_id: eqId }))
  );
}
```

**2. `handleLinkToMission` (eksisterende mission, ~linje 970-973)**
Etter eksisterende drone-upsert (linje 972), legg til:
- Upsert valgt pilot til `mission_personnel`
- Upsert valgt utstyr til `mission_equipment`

```typescript
if (selectedMissionId && pilotId) {
  await supabase.from('mission_personnel').upsert(
    { mission_id: selectedMissionId, profile_id: pilotId },
    { onConflict: 'mission_id,profile_id' }
  );
}
if (selectedMissionId && selectedEquipment.length > 0) {
  await supabase.from('mission_equipment').upsert(
    selectedEquipment.map(eqId => ({ mission_id: selectedMissionId, equipment_id: eqId })),
    { onConflict: 'mission_id,equipment_id' }
  );
}
```

Ingen andre filer endres. Ingen databaseendringer nødvendig — tabellene `mission_personnel` og `mission_equipment` eksisterer allerede.

