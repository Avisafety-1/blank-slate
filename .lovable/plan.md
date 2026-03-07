

## Plan: Gjennomgang og opprydding av utstyr-vedlikehold — collapsible, kalender, realtime, dashboard-status

### Identifiserte problemer

1. **Vedlikeholdsfelt ikke skjult bak Collapsible** — I `EquipmentDetailDialog` (redigeringsmodus) vises alle vedlikeholdsfelter (intervall dager/timer/oppdrag, varsel-felter, sjekkliste) direkte. Droner bruker `Collapsible` fra Radix. Samme mønster skal brukes for utstyr.

2. **Vedlikeholdsfelt i AddEquipmentDialog ikke skjult** — Timer/oppdrag-intervall og varsel-felter vises direkte i opprettelsesdialogen. Bør også bruke Collapsible.

3. **Dashboard (`useStatusData`) bruker kun datobasert status for utstyr** — Linje 84-85 bruker bare `calculateMaintenanceStatus(neste_vedlikehold)`, ikke den nye `calculateEquipmentMaintenanceStatus` med timer/oppdrag. Droner har full aggregert status her.

4. **Resources.tsx sender `missions_since_maintenance: 0` hardkodet** — Oppdragstelling mangler helt for utstyr i listen. Bør telle oppdrag via `mission_equipment`-tabellen, tilsvarende droner.

5. **`performMaintenanceUpdate` setter feil `missions_at_last_maintenance`** — Linje 176 setter verdien til den *eksisterende* verdien i stedet for å telle aktuelle oppdrag. Bør telle unike oppdrag for utstyret og lagre det.

6. **Realtime-oppdatering i `useDashboardRealtime`** — Bør sjekke at equipment-endringer invaliderer queries med riktig nøkkel slik at dashboardets statuspanel oppdateres.

### Endringer

#### 1. `EquipmentDetailDialog.tsx` — Collapsible vedlikeholdsseksjon (redigering)
- Importer `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger`, `ChevronDown`
- Pakk alle vedlikeholdsrelaterte redigeringsfelter (intervall dager/timer/oppdrag, varsel-felter, sist/neste vedlikehold, sjekkliste) i en `Collapsible` med trigger "Vedlikeholdsintervall" — identisk mønster som `DroneDetailDialog`
- Legg til hjelpetekst: "Status trigges av det som kommer først av dager, timer eller oppdrag"

#### 2. `AddEquipmentDialog.tsx` — Collapsible vedlikeholdsseksjon
- Pakk vedlikeholdsrelaterte felter (startdato, intervall dager/timer/oppdrag, varsel-felter, sist vedlikeholdt, sjekkliste) i en Collapsible

#### 3. `useStatusData.ts` — Bruk `calculateEquipmentMaintenanceStatus`
- Erstatt `calculateMaintenanceStatus` med `calculateEquipmentMaintenanceStatus` i `fetchEquipment`
- Legg til oppdragstelling via `mission_equipment` (tilsvarende droner)

#### 4. `Resources.tsx` — Tell oppdrag for utstyr
- I `fetchEquipment`: tell unike oppdrag siden siste vedlikehold via `mission_equipment`-tabellen
- Lagre som `_missionsSinceMaintenance` på hvert utstyr-objekt
- Bruk denne verdien i statusberegningen i stedet for hardkodet `0`

#### 5. `EquipmentDetailDialog.tsx` — Fix `performMaintenanceUpdate`
- Tell unike oppdrag for utstyret via `mission_equipment` og sett `missions_at_last_maintenance` til riktig verdi
- Tilsvarende drone-logikken i `droneInspection.ts`

#### 6. Verifiser realtime
- `useDashboardRealtime.ts` og `ressurser-main`-kanalen i Resources.tsx lytter allerede på `equipment`-tabellen, så realtime fungerer. Men dashboardets `useStatusData` vil nå returnere riktig aggregert status.

### Filer som endres
1. `src/components/resources/EquipmentDetailDialog.tsx` — Collapsible + fix maintenance
2. `src/components/resources/AddEquipmentDialog.tsx` — Collapsible
3. `src/hooks/useStatusData.ts` — aggregert status
4. `src/pages/Resources.tsx` — oppdragstelling

