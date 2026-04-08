

## Egendefinerte roller for personell på oppdrag

### Oversikt
Selskapet definerer egne roller (f.eks. «Ansvarlig pilot», «Observatør», «Sikkerhetsansvarlig») under Selskapsinnstillinger i admin. Når man planlegger oppdrag kan man tildele en rolle til hvert personell.

### Database-migrasjoner

**1. Ny tabell `company_mission_roles`:**
```sql
CREATE TABLE public.company_mission_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, name)
);
ALTER TABLE public.company_mission_roles ENABLE ROW LEVEL SECURITY;
-- RLS: authenticated users in same company can read
```

**2. Ny kolonne på `mission_personnel`:**
```sql
ALTER TABLE public.mission_personnel 
  ADD COLUMN role_id uuid REFERENCES public.company_mission_roles(id) ON DELETE SET NULL;
```

### UI-endringer

**`src/components/admin/ChildCompaniesSection.tsx`**
- Legg til ny seksjon «Roller» i Selskapsinnstillinger-blokken (etter eksisterende toggles)
- Infotekst: «Roller kan tildeles personell ved planlegging av oppdrag»
- CRUD-liste: tekstfelt + «Legg til»-knapp, eksisterende roller med slett-knapp
- Henter/lagrer fra `company_mission_roles`

**`src/components/dashboard/AddMissionDialog.tsx`**
- Hent selskapets roller fra `company_mission_roles`
- I listen over valgt personell (linje ~1186-1207): legg til en liten Select-dropdown ved siden av hvert navn for å velge rolle
- State endres fra `string[]` til `{ profileId: string, roleId: string | null }[]` (eller en parallell map `personnelRoles: Record<string, string | null>`)
- Ved INSERT til `mission_personnel`: inkluder `role_id`
- Ved fetch av eksisterende personell: hent `role_id` i tillegg

**`src/components/dashboard/MissionResourceSections.tsx`**
- Hent `role_id` og join med `company_mission_roles` for å vise rollenavn ved siden av personellnavnet på oppdragskortet

### Filer som endres
1. **Ny migrasjon** — `company_mission_roles`-tabell + `role_id`-kolonne på `mission_personnel`
2. **`src/components/admin/ChildCompaniesSection.tsx`** — Roller-seksjon i innstillinger
3. **`src/components/dashboard/AddMissionDialog.tsx`** — Rollevelger per personell
4. **`src/components/dashboard/MissionResourceSections.tsx`** — Vis rolle på oppdragskortet

