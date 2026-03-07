

## Plan: Konfigurerbar «varsel før gul» for timer og oppdrag

### Nåværende situasjon
- **Dager**: Konfiguerbart via `varsel_dager` (f.eks. 14 dager før → Gul)
- **Timer/oppdrag**: Hardkodet 80%-ratio i `calculateUsageStatus`

### Endringer

#### 1. Databasemigrasjon
```sql
ALTER TABLE public.drones
  ADD COLUMN IF NOT EXISTS varsel_timer numeric NULL,
  ADD COLUMN IF NOT EXISTS varsel_oppdrag integer NULL;
```

#### 2. `maintenanceStatus.ts`
Oppdater `calculateUsageStatus` til å akseptere en absolutt varselmargin i stedet for ratio:
```typescript
calculateUsageStatus(currentUsage, limit, warningMargin?)
```
- Gul når `currentUsage >= limit - warningMargin`
- Faller tilbake til 80%-ratio hvis warningMargin ikke er satt

Oppdater `calculateDroneInspectionStatus` til å ta inn `varsel_timer` og `varsel_oppdrag` og sende de videre.

#### 3. `DroneDetailDialog.tsx`
- **Drone-interface**: Legg til `varsel_timer`, `varsel_oppdrag`
- **formData**: Legg til tilsvarende felt
- **Edit-modus**: Endre varsel-seksjonen fra 1 felt til 3 felt i et grid:
  - «Varsel dager før gul» (eksisterende)
  - «Varsel timer før gul»
  - «Varsel oppdrag før gul»
- **Save-handler**: Inkluder nye felt i update-kallet
- **View-modus**: Bruk `varsel_timer`/`varsel_oppdrag` i progress-bar-beregningene

#### 4. `useStatusData.ts`
Send `varsel_timer` og `varsel_oppdrag` fra drone-data inn i `calculateDroneInspectionStatus` og `calculateDroneAggregatedStatus`.

#### 5. Realtime sync
Allerede dekket:
- `useDashboardRealtime` lytter på `drones`-tabellen og invaliderer `['drones', companyId]`
- `DroneDetailDialog` har egen realtime-kanal for `drones` filtrert på drone-id
- Begge bruker `select('*')`, så nye kolonner plukkes opp automatisk

### Berørte filer
- Ny migrasjon (SQL)
- `src/lib/maintenanceStatus.ts`
- `src/components/resources/DroneDetailDialog.tsx`
- `src/hooks/useStatusData.ts`

