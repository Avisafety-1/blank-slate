

## Plan: "Mitt selskap"-tab alltid synlig, avdelingsseksjon styrt av toggle

### Problem
Taben "Mitt selskap" (`child-companies`) i Admin vises kun når `departmentsEnabled` er true (eller bruker er superadmin). Ønsket er at taben alltid skal vises for alle admins, men at seksjonen "Avdelinger" (opprette/administrere underavdelinger) nederst i taben kun vises når `departmentsEnabled` er aktivert av superadmin.

### Endringer

#### 1. `src/pages/Admin.tsx`
- Fjern `departmentsEnabled`-betingelsen fra TabsTrigger og TabsContent for `child-companies`-taben, slik at den alltid vises for alle admins (ikke bare superadmins og de med departments enabled)
- Betingelsen `{(isSuperAdmin || (!isChildCompany && departmentsEnabled))}` erstattes med `{(isSuperAdmin || !isChildCompany)}` — eller bare fjernes helt slik at alle admins ser taben
- Send `departmentsEnabled` som prop til `ChildCompaniesSection`

#### 2. `src/components/admin/ChildCompaniesSection.tsx`
- Ta imot ny prop `departmentsEnabled: boolean`
- Wrap "Avdelinger"-seksjonen (GlassCard med "Ny avdeling"-knapp, tabellen, og CompanyManagementDialog) i en `{departmentsEnabled && (...)}` betingelse
- Selskapsinnstillinger-seksjonen (øverst) forblir alltid synlig

### Resultat
- Alle admins (ikke underavdelinger) ser alltid "Mitt selskap"-taben
- Selskapsinnstillinger (FH2, roller, varsler osv.) er alltid tilgjengelige
- Muligheten til å opprette/administrere avdelinger vises kun når superadmin har aktivert `departments_enabled` for selskapet

### Omfang
Minimal — 2 filer, kun betingelsesendringer.

