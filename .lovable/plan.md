

## Plan: Auto-sync `user_companies` ved rolletildeling som administrator

### Problem
Selskapsvelgeren bruker `get_user_accessible_companies()` som leser fra `user_companies`-tabellen. Når en bruker settes som administrator i Admin-panelet, oppdateres kun `user_roles` — men `user_companies` får aldri en rad. Uten denne raden vises ikke selskapsvelgeren.

### Løsning: Database-trigger på `user_roles`

Opprett en trigger på `user_roles`-tabellen som kjører etter INSERT eller UPDATE. Når en bruker tildeles rollen `administrator` (eller `superadmin`), sjekker triggeren om brukerens selskap (fra `profiles.company_id`) har barn (`parent_company_id`-referanser). Hvis ja, settes en rad inn i `user_companies` automatisk.

### SQL-migrasjon

```sql
-- Trigger-funksjon
CREATE OR REPLACE FUNCTION sync_user_companies_on_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- Kun relevant for admin/superadmin-roller
  IF NEW.role NOT IN ('administrator', 'superadmin') THEN
    RETURN NEW;
  END IF;

  -- Hent brukerens company_id fra profiles
  SELECT company_id INTO v_company_id
  FROM profiles WHERE id = NEW.user_id;

  IF v_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Sjekk om selskapet har barn (avdelinger)
  IF EXISTS (
    SELECT 1 FROM companies 
    WHERE parent_company_id = v_company_id
  ) THEN
    INSERT INTO user_companies (user_id, company_id)
    VALUES (NEW.user_id, v_company_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger på user_roles
CREATE TRIGGER on_role_change_sync_user_companies
AFTER INSERT OR UPDATE ON user_roles
FOR EACH ROW
EXECUTE FUNCTION sync_user_companies_on_role_change();

-- Backfill: eksisterende administratorer i selskaper med avdelinger
INSERT INTO user_companies (user_id, company_id)
SELECT p.id, p.company_id
FROM profiles p
JOIN user_roles ur ON ur.user_id = p.id
WHERE ur.role IN ('administrator', 'superadmin')
  AND p.company_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM companies 
    WHERE parent_company_id = p.company_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM user_companies uc 
    WHERE uc.user_id = p.id AND uc.company_id = p.company_id
  )
ON CONFLICT DO NOTHING;
```

### Filer
- SQL-migrasjon (trigger + backfill) — ingen kodeendringer nødvendig

