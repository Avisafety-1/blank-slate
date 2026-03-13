

## Diagnose: Feil ved sletting av bruker

### Årsak
`mission_risk_assessments.pilot_id` er **NOT NULL** med **NO ACTION** som FK-regel mot `profiles`. Når edge-funksjonen prøver å slette brukeren:

1. `setNull("mission_risk_assessments", "pilot_id")` → **feiler** fordi kolonnen er NOT NULL (logges som warning, funksjonen fortsetter)
2. `profiles` slettes → blokkeres av FK-constraint fra `mission_risk_assessments`
3. `auth.admin.deleteUser()` → feiler fordi auth.users CASCADE til profiles, som fortsatt er blokkert

Brukeren som Sisjord prøvde å slette har sannsynligvis én eller flere risikovurderinger knyttet til seg.

### Løsning
To endringer:

**1. Database-migrasjon**: Gjør `mission_risk_assessments.pilot_id` nullable og endre FK-regelen til SET NULL:
```sql
ALTER TABLE mission_risk_assessments 
  ALTER COLUMN pilot_id DROP NOT NULL;

ALTER TABLE mission_risk_assessments 
  DROP CONSTRAINT mission_risk_assessments_pilot_id_fkey,
  ADD CONSTRAINT mission_risk_assessments_pilot_id_fkey 
    FOREIGN KEY (pilot_id) REFERENCES profiles(id) ON DELETE SET NULL;
```

**2. Edge function**: Oppdater `admin-delete-user/index.ts` slik at NOT NULL join-tabeller (drone_personnel, mission_personnel, flight_log_personnel, personnel_competencies, personnel_log_entries) bruker DELETE i stedet for SET NULL, siden disse radene uansett blir cascade-slettet når profilen fjernes. Legg også til feilhåndtering på profiles-delete.

### Berørte filer
- `supabase/migrations/` — ny migrasjon for `mission_risk_assessments.pilot_id`
- `supabase/functions/admin-delete-user/index.ts` — flytt NOT NULL-kolonner fra setNull til delete-seksjonen

