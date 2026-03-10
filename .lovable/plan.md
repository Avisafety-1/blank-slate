

## Plan: DroneTag-integrasjon som feature-toggle for live-modus

### Endringer

#### 1. Database: Ny kolonne `dronetag_enabled` på `companies`
```sql
ALTER TABLE public.companies ADD COLUMN dronetag_enabled boolean NOT NULL DEFAULT false;
```

#### 2. `CompanyManagementSection.tsx` — Ny switch
Legg til en `dronetag_enabled`-switch ved siden av de eksisterende (ECCAIRS, DJI) med tilhørende toggle-handler som oppdaterer `companies.dronetag_enabled`. Vis badge «DroneTag» når aktivert.

- Utvid `Company`-interfacet med `dronetag_enabled: boolean`
- Legg til `handleToggleDronetag`-funksjon (samme mønster som `handleToggleEccairs`)
- Legg til Switch + Label i både mobil- og desktop-visning

#### 3. `StartFlightDialog.tsx` — Hent flagg og lås live-modus
- Hent `dronetag_enabled` fra `companies`-tabellen basert på `companyId` (i eksisterende useEffect)
- Disable `live_uav`-radioknappen når `dronetag_enabled === false`
- Vis teksten «Krever DroneTag-integrasjon» under live-alternativet når det er låst (samme stil som «Krever rute» for advisory)

### Filer
- Database-migrasjon (ny kolonne)
- `src/components/admin/CompanyManagementSection.tsx`
- `src/components/StartFlightDialog.tsx`

