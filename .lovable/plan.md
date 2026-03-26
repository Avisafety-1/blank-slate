

## Ny selskapsinnstilling: «Oppdrag krever godkjenning»

### Endringer

#### 1. Database-migrasjon
```sql
ALTER TABLE companies ADD COLUMN require_mission_approval boolean NOT NULL DEFAULT false;
```

#### 2. `src/components/admin/ChildCompaniesSection.tsx`
- Ny state `requireMissionApproval`
- Hent og lagre verdien i `fetchParentSettings`
- Ny toggle med:
  - Label: **Oppdrag krever godkjenning**
  - Undertekst: **SORA-spesifikk godkjenningslogikk overstyrer dette valget**
- Ny handler `handleToggleRequireMissionApproval` (samme mønster som de andre)
- Propager til barn i `handleToggleApplyToChildren`

#### 3. `src/hooks/useCompanySettings.ts`
- Legg til `require_mission_approval: boolean` i `CompanySettings`
- Hent verdien fra `companies`

#### 4. Bruk innstillingen i godkjenningslogikken
I **`src/components/dashboard/MissionsSection.tsx`** og **`src/components/dashboard/MissionDetailDialog.tsx`**:
- Hent `useCompanySettings()`
- Når `require_mission_approval` er `true`: nye oppdrag starter med `approval_status = 'not_approved'` og viser godkjenningsbadge (dette er allerede default-oppførsel)
- Når `false`: skjul godkjenningsbadge og «Send til godkjenning»-knapp, slik at oppdrag ikke trenger godkjenning

I **`src/components/oppdrag/MissionCard.tsx`**:
- Samme logikk: skjul godkjenningsbadge og menyvalg når innstillingen er av

I **`src/components/dashboard/StartFlightDialog.tsx`**:
- Når `require_mission_approval` er `false`: ikke blokker oppstart basert på `approval_status`

### Filer som endres
1. Database-migrasjon (ny kolonne)
2. `src/components/admin/ChildCompaniesSection.tsx` — ny toggle
3. `src/hooks/useCompanySettings.ts` — nytt felt
4. `src/components/dashboard/MissionsSection.tsx` — betinget godkjennings-UI
5. `src/components/dashboard/MissionDetailDialog.tsx` — betinget godkjennings-UI
6. `src/components/oppdrag/MissionCard.tsx` — betinget badge/meny
7. `src/components/dashboard/StartFlightDialog.tsx` — betinget blokkering

