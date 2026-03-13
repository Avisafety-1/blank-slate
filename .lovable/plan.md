

## Problem

Sletting feiler fordi tre tabeller har foreign keys mot `auth.users` med `NO ACTION` delete-regel:

| Tabell | Kolonne | Delete Rule |
|--------|---------|-------------|
| `missions` | `approved_by` | NO ACTION |
| `profiles` | `approved_by` | NO ACTION |
| `revenue_calculator_scenarios` | `updated_by` | NO ACTION |

Når edge-funksjonen kjører `auth.admin.deleteUser()`, blokkerer disse FK-ene transaksjonen hvis brukeren har godkjent oppdrag, godkjent profiler, eller oppdatert kalkulatorscenarier.

Edge-funksjonen setter allerede `missions.approved_by` og `profiles.approved_by` til NULL manuelt, men dette gjøres via Supabase-klienten med RLS — og service_role-klienten brukes uten `.eq('approved_by', targetUserId)` for `missions.approved_by`. Men selv om SET NULL lykkes, så er FK-regelen fortsatt `NO ACTION` på databasenivå, som betyr at `auth.admin.deleteUser()` blokkeres.

## Løsning

**Database-migrasjon** — endre alle tre FK-er til `ON DELETE SET NULL`:

```sql
-- missions.approved_by
ALTER TABLE missions
  DROP CONSTRAINT missions_approved_by_fkey,
  ADD CONSTRAINT missions_approved_by_fkey
    FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- profiles.approved_by  
ALTER TABLE profiles
  DROP CONSTRAINT profiles_approved_by_fkey,
  ADD CONSTRAINT profiles_approved_by_fkey
    FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- revenue_calculator_scenarios.updated_by
ALTER TABLE revenue_calculator_scenarios
  DROP CONSTRAINT revenue_calculator_scenarios_updated_by_fkey,
  ADD CONSTRAINT revenue_calculator_scenarios_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
```

Ingen kodeendringer nødvendig — edge-funksjonen håndterer allerede SET NULL manuelt, men databasenivå-constraintene må også tillate det.

