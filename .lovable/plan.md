

## Plan: Legg til timer- og oppdragsbaserte vedlikeholdsintervaller for utstyr

Droner har i dag tre typer vedlikeholdsintervaller: dager, flytimer og oppdrag. Utstyr har kun dager. Denne planen legger til de to manglende typene.

### 1. Database-migrasjon (`equipment`-tabellen)

Legg til 6 nye kolonner:

```sql
ALTER TABLE equipment
  ADD COLUMN inspection_interval_hours numeric DEFAULT NULL,
  ADD COLUMN inspection_interval_missions integer DEFAULT NULL,
  ADD COLUMN hours_at_last_maintenance numeric DEFAULT 0,
  ADD COLUMN missions_at_last_maintenance integer DEFAULT 0,
  ADD COLUMN varsel_timer numeric DEFAULT NULL,
  ADD COLUMN varsel_oppdrag integer DEFAULT NULL;
```

### 2. `EquipmentDetailDialog.tsx` — Redigeringsmodus

Legg til felter for:
- **Flytimer mellom vedlikehold** (`inspection_interval_hours`)
- **Oppdrag mellom vedlikehold** (`inspection_interval_missions`)
- **Varsel timer før gul** (`varsel_timer`)
- **Varsel oppdrag før gul** (`varsel_oppdrag`)

Oppdater `formData` state, `handleSave`, og `performMaintenanceUpdate` (sett `hours_at_last_maintenance` og `missions_at_last_maintenance` ved vedlikehold).

### 3. `EquipmentDetailDialog.tsx` — Visningsmodus

Vis progress-barer for timer og oppdrag (som droner gjør), med status-farger basert på `calculateUsageStatus`.

### 4. `AddEquipmentDialog.tsx`

Legg til valgfrie felter for timer- og oppdragsintervall ved opprettelse.

### 5. `maintenanceStatus.ts` — Statusberegning

Lag `calculateEquipmentMaintenanceStatus` som kombinerer alle tre kriterier (dager, timer, oppdrag) og returnerer verste status — tilsvarende `calculateDroneInspectionStatus`.

### 6. `Resources.tsx` — Statusvisning i listen

Oppdater utstyrslisten til å bruke den nye kombinerte statusberegningen i stedet for kun datobasert status.

### 7. Oppdrag-telling

Utstyr kobles til oppdrag via `mission_equipment`-tabellen. Ved vedlikehold telles unike oppdrag siden siste vedlikehold, tilsvarende drone-logikken.

### Filer som endres
1. **Database-migrasjon** — 6 nye kolonner
2. `src/components/resources/EquipmentDetailDialog.tsx` — form, visning, vedlikehold
3. `src/components/resources/AddEquipmentDialog.tsx` — nye felter
4. `src/lib/maintenanceStatus.ts` — ny funksjon
5. `src/pages/Resources.tsx` — oppdatert statusberegning

