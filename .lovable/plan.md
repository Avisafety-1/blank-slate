

## Plan: Fiks arv av innstillinger fra moderselskap til avdelinger

### Rotårsak
Når en bruker er i avdeling "C", prøver AuthContext å lese moderselskapets innstillinger. Men RLS-policyen på `companies`-tabellen tillater kun lesing av eget selskap og egne barn, **ikke** moderselskapet. Dermed feiler oppslaget stille, og `stripe_exempt` og `dji_flightlog_enabled` forblir `false`.

Moderselskapet "Gard HH" har `stripe_exempt=true` og `dji_flightlog_enabled=true`, mens avdeling "C" har begge som `false`.

### Endringer

#### 1. Oppdater RLS SELECT-policy på `companies` (migrasjon)
Utvid policyen til å også tillate at avdelingsbrukere kan lese sitt moderselskap:

```sql
DROP POLICY "Users can view own company and children" ON public.companies;
CREATE POLICY "Users can view own company, parent and children" ON public.companies
FOR SELECT TO authenticated
USING (
  id = get_user_company_id(auth.uid())
  OR parent_company_id = get_user_company_id(auth.uid())
  OR id = (
    SELECT c.parent_company_id FROM public.companies c
    WHERE c.id = get_user_company_id(auth.uid())
  )
);
```

#### 2. Kopier innstillinger ved opprettelse av avdeling (`CompanyManagementDialog.tsx`)
Når `forceParentCompanyId` er satt (opprettelse av avdeling), hent moderselskapet og kopier `stripe_exempt`, `dji_flightlog_enabled` og `selskapstype` inn i den nye avdelingen.

#### 3. Oppdater eksisterende avdeling "C" (engangsmigrasjon)
Sett `stripe_exempt=true` og `dji_flightlog_enabled=true` på avdeling C basert på moderselskapet.

```sql
UPDATE companies
SET stripe_exempt = parent.stripe_exempt,
    dji_flightlog_enabled = parent.dji_flightlog_enabled
FROM companies parent
WHERE companies.parent_company_id = parent.id
  AND companies.parent_company_id IS NOT NULL;
```

### Filer som endres
- **Ny migrasjon**: RLS-policy + synk eksisterende avdelinger
- **`src/components/admin/CompanyManagementDialog.tsx`**: Kopier innstillinger fra moderselskap ved opprettelse

