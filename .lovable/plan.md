

## Problem: `auto_assign_admin_on_approval` trigger overskriver rollen

Jeg har funnet rotårsaken. Det er **to triggere** som kjører i sekvens:

1. **Ved registrering** → `handle_new_profile_role` → setter rolle til `'administrator'` ✅
2. **Ved godkjenning** → `auto_assign_admin_on_approval` → **overskriver rollen til `'admin'`** (legacy!) ❌

Så når admin godkjenner en ny bruker, overskrives den korrekte `administrator`-rollen med den gamle `admin`-verdien. Dette forklarer:
- Blank rolle i dropdown (fordi `admin` ikke er i `availableRoles`)
- Ingen admin-tilgang (fordi `has_role('administrator')` ikke matcher `admin` i selve databasen, selv om `has_role()` funksjonen har backward compat)

I tillegg: Du ønsker at nye brukere skal få `bruker`-rollen (ikke `administrator`).

## Løsning

### 1. Database-migrasjon
- **Oppdater `auto_assign_admin_on_approval()`**: Endre fra `'admin'` til `'bruker'`
- **Oppdater `handle_new_profile_role()`**: Endre fra `'administrator'` til `'bruker'`
- **Fiks `gard@avisafe.no`**: Konverter `admin` → `administrator` (igjen, siden godkjenningstrigger overskrev)
- **Oppdater RLS på `email_template_attachments`**: Legg til `'administrator'` i tillegg til `'admin'`

### 2. Frontend-endring
- **`useRoleCheck.ts`**: Legg til `'admin'` som alias i `roleHierarchy` slik at eldre roller fortsatt gir riktig tilgangsnivå

### Filer som endres
- **Database-migrasjon** (ny SQL)
- **`src/hooks/useRoleCheck.ts`** — roleHierarchy-oppdatering

