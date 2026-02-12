

# Sikring av RLS-policyer med selskapsfilter

## Problemet

Selv om brukere logger inn til sitt eget selskap, kan de teknisk sett bruke sin JWT-token til a sende direkte API-kall til Supabase REST API (utenfor appen). Policyer som `auth.role() = 'authenticated'` gir da tilgang til data fra alle selskaper.

## Garantert ikke-brekende endringer

Alle endringene legger til **strengere betingelser** pa eksisterende policyer. Brukere som i dag jobber innenfor sitt eget selskap vil ikke merke noen forskjell -- queryene deres oppfyller allerede de nye betingelsene. Det eneste som endres er at direkte API-misbruk pa tvers av selskaper blokkeres.

## Endringer (4 SQL-migrasjoner)

### Migrasjon 1: mission_drones, mission_equipment, mission_personnel

For alle tre tabellene gjelder identisk monster:

**Dropper:**
- "All authenticated users can view [table]" (SELECT uten selskapsfilter)
- "Admins can manage all [table]" (ALL uten selskapsfilter)

**Oppretter:**
- Ny SELECT: Brukere kan se rader der oppdragets company_id matcher eget selskap
- Ny admin ALL: Adminer kan administrere rader der oppdragets company_id matcher eget selskap

```text
-- Ny SELECT-policy (erstatter "all authenticated")
CREATE POLICY "Users can view mission_drones in own company"
ON mission_drones FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM missions
    WHERE missions.id = mission_drones.mission_id
    AND missions.company_id = get_user_company_id(auth.uid())
  )
);

-- Ny admin-policy (erstatter "admins can manage all")
CREATE POLICY "Admins can manage mission_drones in own company"
ON mission_drones FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin') AND
  EXISTS (
    SELECT 1 FROM missions
    WHERE missions.id = mission_drones.mission_id
    AND missions.company_id = get_user_company_id(auth.uid())
  )
)
WITH CHECK (...same...);
```

Identisk for mission_equipment og mission_personnel.

### Migrasjon 2: personnel_competencies

**Dropper:**
- "All authenticated users can view personnel competencies"
- "Admins can delete all competencies"
- "Admins and saksbehandler can create all competencies"
- "Admins and saksbehandler can update all competencies"

**Oppretter:**
- Ny SELECT: Via profiles-subquery for selskapsfilter
- Ny admin DELETE/INSERT/UPDATE: Med selskapsfilter via profiles

```text
-- Ny SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = personnel_competencies.profile_id
    AND profiles.company_id = get_user_company_id(auth.uid())
  )
);
```

### Migrasjon 3: user_roles

**Dropper:**
- "Admins can view all roles"
- "Admins can insert non-superadmin roles"
- "Admins can update non-superadmin roles"
- "Admins can delete non-superadmin roles"

**Oppretter:**
- Samme policyer MED selskapsfilter via profiles-subquery

```text
-- Eksempel: Admins kan se roller i eget selskap
USING (
  has_role(auth.uid(), 'admin') AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = user_roles.user_id
    AND profiles.company_id = get_user_company_id(auth.uid())
  )
);
```

### Migrasjon 4: Views (eccairs_integrations_safe, email_settings_safe)

Gjenskape begge views med `security_invoker = true` slik at RLS pa underliggende tabeller respekteres.

```text
CREATE OR REPLACE VIEW eccairs_integrations_safe
WITH (security_invoker = on) AS
SELECT ... FROM eccairs_integrations;
```

## Hva pavirkes IKKE

- Ingen frontend-kode endres
- Brukere som jobber innenfor eget selskap merker ingen forskjell
- Superadmin-policyer (som allerede bruker `is_superadmin()`) pavirkes ikke
- "Users can manage [table] for their missions"-policyer beholdes uendret (de har allerede riktig subquery)
- Eksisterende "Users can view/delete own"-policyer beholdes uendret

## Risiko

**Svart lav** -- vi legger kun til strengere filtrering. Alle legitime operasjoner i appen bruker allerede data fra eget selskap, sa de nye betingelsene er automatisk oppfylt.

