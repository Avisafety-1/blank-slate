

## SORA-basert godkjenning overstyrer «Oppdrag krever godkjenning»

### Problem
Når `sora_based_approval` er aktivert i SORA-konfig, skal godkjenningsbadgen alltid vises (uavhengig av `require_mission_approval`-togglen). Default-status skal være «Ikke godkjent» til SORA auto-godkjenning trigger eller manuell godkjenning skjer.

### Løsning
Lage en hook som sjekker om SORA-basert godkjenning er aktiv, og bruke den i tillegg til `require_mission_approval` for å avgjøre om godkjennings-UI vises.

### Endringer

#### 1. Ny hook: `src/hooks/useSoraApprovalEnabled.ts`
- Henter `sora_based_approval` fra `company_sora_config` for gjeldende `companyId`
- Returnerer `boolean`
- Cacher resultatet (samme mønster som `useCompanySettings`)

#### 2. Oppdater godkjennings-UI i 3 filer
Erstatt `companySettings.require_mission_approval` med:
```ts
const showApproval = companySettings.require_mission_approval || soraApprovalEnabled;
```

Filer:
- **`src/components/dashboard/MissionsSection.tsx`** — linje 278
- **`src/components/dashboard/MissionDetailDialog.tsx`** — linje 217, 223, 229
- **`src/components/oppdrag/MissionCard.tsx`** — linje 140, 146, 152, 238

#### 3. StartFlightDialog (hvis relevant)
- Sjekk om `soraApprovalEnabled` også skal blokkere flystart når `approval_status !== 'approved'`

### Filer som endres
1. `src/hooks/useSoraApprovalEnabled.ts` — ny hook
2. `src/components/dashboard/MissionsSection.tsx` — bruk `showApproval`
3. `src/components/dashboard/MissionDetailDialog.tsx` — bruk `showApproval`
4. `src/components/oppdrag/MissionCard.tsx` — bruk `showApproval`

