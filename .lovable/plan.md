

## Plan: Avdelingssynlighet for droner og utstyr ✅ Implementert

### Hva ble gjort

1. **Database**: Opprettet `drone_department_visibility` og `equipment_department_visibility` tabeller med RLS-policyer. Oppdatert SELECT-policyer på `drones` og `equipment` med `OR EXISTS`-sjekk mot synlighetstabellene.

2. **Hook**: `useDepartmentVisibility` — gjenbrukbar hook for begge ressurstyper. Henter avdelinger, nåværende synlighetsvalg, og synkroniserer ved lagring.

3. **UI**: `DepartmentChecklist` vist i redigeringsmodus i `DroneDetailDialog` og `EquipmentDetailDialog` — kun for administratorer når avdelinger finnes.
