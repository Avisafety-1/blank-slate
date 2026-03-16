

## Superadmin-styrt avdelingsstruktur

### Hva
Legge til en boolean `departments_enabled` på `companies`-tabellen som kun superadmins kan endre. Når denne er `false` (default), vises ikke "Avdelinger"-fanen i Admin-panelet for det selskapet.

### Database
- Ny kolonne: `companies.departments_enabled boolean NOT NULL DEFAULT false`
- Ingen RLS-endring nødvendig — kolonnen leses via eksisterende select-policyer

### UI-endringer

**CompanyManagementDialog.tsx** (superadmin-visning):
- Legge til en ny Switch under "Ekskluder fra Stripe"-toggle: "Avdelingsstruktur" med beskrivelse "Aktiver avdelinger/underselskaper for dette selskapet"
- Lagre verdien i `departments_enabled`

**Admin.tsx**:
- Endre betingelsen for "Avdelinger"-fanen fra `!isSuperAdmin && !isChildCompany` til `!isSuperAdmin && !isChildCompany && companyDepartmentsEnabled`
- Hente `departments_enabled` fra company-data (allerede tilgjengelig via AuthContext sin company-query, eller hentes separat)

**AuthContext.tsx**:
- Legge til `departmentsEnabled` i konteksten, hentet fra `companies`-tabellen sammen med eksisterende felter

### Filer som endres

| Fil | Endring |
|-----|---------|
| Ny migrasjon | `ALTER TABLE companies ADD COLUMN departments_enabled boolean NOT NULL DEFAULT false` |
| `src/components/admin/CompanyManagementDialog.tsx` | Ny Switch for departments_enabled |
| `src/contexts/AuthContext.tsx` | Lese og eksponere `departmentsEnabled` |
| `src/pages/Admin.tsx` | Betingelse for Avdelinger-fanen sjekker `departmentsEnabled` |

