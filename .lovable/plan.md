
# Forenkling av roller: 3 roller i stedet for 5

## Bakgrunn og nåværende situasjon

I dag er det 5 roller i hierarkiet:
```text
superadmin > admin > saksbehandler > operatør > lesetilgang
```

Rollene `saksbehandler`, `operatør` og `lesetilgang` er i praksis redundante nå som spesialtilganger (ECCAIRS, oppfølgingsansvarlig, oppdragsgodkjenner) er lagt på personen som individuelle brytervalg.

## Ny rollestruktur

```text
superadmin > administrator > bruker
```

| Rolle | Tilgang | Hvem tildeler |
|---|---|---|
| superadmin | Alt, inkludert selskapsstyring | Kan kun settes av eksisterende superadmin |
| administrator | Alt bortsett fra superadmin-funksjoner. Kan se tannhjul/admin-side. Kan IKKE tildele superadmin | Administrator eller superadmin |
| bruker | Samme som saksbehandler i dag: full tilgang til data, men kan IKKE se tannhjulet/admin-siden | Administrator eller superadmin |

Nye brukere som registrerer seg får automatisk rollen `bruker` (i dag: `lesetilgang`).

## Hva som endres

### 1. Database — ny migrasjon

Oppdaterer `app_role`-enumen med 3 nye verdier og fjerner de gamle:

```sql
-- Legg til nye roller
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'bruker';

-- Migrer eksisterende brukere:
-- operatør og lesetilgang -> bruker
-- saksbehandler -> bruker
-- admin -> administrator (admin beholdes som alias for bakoverkompatibilitet med RLS)
UPDATE user_roles SET role = 'bruker'
  WHERE role IN ('lesetilgang', 'operatør', 'saksbehandler');
```

Merk: Selve enum-verdiene `lesetilgang`, `operatør` og `saksbehandler` kan ikke droppes fra enum-typen uten å ta ned hele databasen, men de vil ikke lenger brukes eller vises i UI. RLS-policyer som refererer til `saksbehandler` og `operatør` oppdateres til å bruke `bruker`.

### 2. RLS-policyer — oppdatering

Alle policyer som i dag sjekker `has_role(..., 'saksbehandler')` eller `has_role(..., 'operatør')` oppdateres til å sjekke `has_role(..., 'bruker')`. Dette gjelder tabeller som:
- `drones` (UPDATE-policy)
- `documents` (UPDATE-policy)
- `customers` (UPDATE-policy)
- `calendar_events` (UPDATE-policy)
- og andre relevante tabeller

### 3. `has_role()`-funksjonen — nytt hierarki

Funksjonen oppdateres slik at `bruker` arvger ingenting, `administrator` arver `bruker`, og `superadmin` arver alle:

```sql
-- Nytt hierarki: superadmin >= administrator >= bruker
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean AS $$
  SELECT CASE _role
    WHEN 'superadmin' THEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = 'superadmin')
    WHEN 'administrator' THEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role IN ('superadmin', 'administrator'))
    WHEN 'bruker' THEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role IN ('superadmin', 'administrator', 'bruker'))
    ELSE false
  END
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
```

### 4. `AuthContext.tsx` — `isAdmin` logikk

Oppdateres slik at `isAdmin` (som kontrollerer tilgang til tannhjulet) settes til `true` kun for `administrator` og `superadmin`:

```typescript
// Før:
profileData.isAdmin = role === 'admin' || role === 'superadmin';

// Etter:
profileData.isAdmin = role === 'administrator' || role === 'superadmin';
```

### 5. `useRoleCheck.ts` — forenklet hierarki

```typescript
const roleHierarchy = ['bruker', 'administrator', 'superadmin'];
// isSaksbehandler og isOperator fjernes
// isAdmin vil nå sjekke 'administrator'
```

### 6. `Admin.tsx` — UI-endringer

- `availableRoles`-listen endres til å kun vise 3 valg:
  - Superadmin (kun synlig for superadmins)
  - Administrator
  - Bruker
- Rollevalget for `superadmin` skjules for vanlige administratorer (kun superadmin kan tildele superadmin)
- Teksten og fargekodingen i rollebadges oppdateres

### 7. `Auth.tsx` — standardrolle for nye brukere

```typescript
// Før:
role: 'lesetilgang'

// Etter:
role: 'bruker'
```

### 8. `ProfileDialog.tsx` — rollevisning

Rollebadges og rollenavn i profilvisningen oppdateres til å reflektere de nye rollene.

### 9. `types.ts` og i18n-filer

- `src/integrations/supabase/types.ts` oppdateres med `bruker` og `administrator`
- `src/i18n/locales/no.json` og `en.json` oppdateres:
  - `roles.bruker` = "Bruker" / "User"
  - `roles.administrator` = "Administrator" / "Administrator"
  - De gamle rollenøklene (`saksbehandler`, `operator`, `readonly`) kan beholdes for bakoverkompatibilitet i oversettelsesfilene

## Hva som IKKE endres

- Selve RLS-sikkerhetsmodellen (company isolation, profil-level permissions) forblir uendret
- Spesialtilgangene på personen (`can_approve_missions`, `can_access_eccairs`, `can_be_incident_responsible`) forblir uendret
- Eksisterende data mistes ikke — kun roller migreres

## Filer som endres

| Fil | Endring |
|---|---|
| `supabase/migrations/[ts]_simplify_roles.sql` | Ny migrasjon: legg til `bruker`/`administrator`, migrer eksisterende brukere, oppdater `has_role()`, oppdater RLS-policyer |
| `src/integrations/supabase/types.ts` | Legg til `bruker` og `administrator` i enum |
| `src/contexts/AuthContext.tsx` | `isAdmin` sjekker nå `administrator` i stedet for `admin` |
| `src/hooks/useRoleCheck.ts` | Forenkle hierarki til 3 roller |
| `src/pages/Admin.tsx` | Oppdater `availableRoles`, skjul superadmin for administratorer |
| `src/pages/Auth.tsx` | Standardrolle: `bruker` i stedet for `lesetilgang` |
| `src/components/ProfileDialog.tsx` | Oppdater rollebadges og rollenavn |
| `src/i18n/locales/no.json` | Legg til `roles.bruker` og `roles.administrator` |
| `src/i18n/locales/en.json` | Legg til `roles.bruker` og `roles.administrator` |
