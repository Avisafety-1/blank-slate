

## Plan: Rydd opp user_companies ved selskapsbytte

### Problem
Triggeren `sync_user_companies_on_role_change` fyrer kun på `user_roles`-endringer. Når en administrator flyttes fra morselskap til avdeling (profiles.company_id oppdateres), blir den gamle `user_companies`-raden stående. Brukeren beholder dermed tilgang til selskapsvelgeren og kan se/bytte til alle avdelinger — selv om de nå kun skal ha tilgang til sin egen avdeling.

### Løsning — Ny trigger på profiles

Opprett en trigger-funksjon `sync_user_companies_on_company_change()` som fyrer `AFTER UPDATE OF company_id ON profiles`:

```sql
CREATE OR REPLACE FUNCTION sync_user_companies_on_company_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Kun reager på faktisk endring av company_id
  IF OLD.company_id IS NOT DISTINCT FROM NEW.company_id THEN
    RETURN NEW;
  END IF;

  -- Sjekk om brukeren er administrator/superadmin
  IF NOT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = NEW.id 
      AND role IN ('administrator', 'superadmin')
  ) THEN
    RETURN NEW;
  END IF;

  -- Fjern gammel user_companies-rad for det forrige selskapet
  IF OLD.company_id IS NOT NULL THEN
    DELETE FROM user_companies 
    WHERE user_id = NEW.id 
      AND company_id = OLD.company_id;
  END IF;

  -- Legg til ny rad kun hvis det nye selskapet har barn
  IF NEW.company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM companies 
    WHERE parent_company_id = NEW.company_id
  ) THEN
    INSERT INTO user_companies (user_id, company_id)
    VALUES (NEW.id, NEW.company_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_company_change_sync
AFTER UPDATE OF company_id ON profiles
FOR EACH ROW
EXECUTE FUNCTION sync_user_companies_on_company_change();
```

### Hva dette gjør
- Når en bruker flyttes fra morselskap til avdeling: den gamle `user_companies`-raden slettes, ingen ny opprettes (avdelinger har ikke barn) → selskapsvelgeren forsvinner
- Når en bruker flyttes fra avdeling til morselskap: ny rad opprettes → selskapsvelgeren vises korrekt
- Vanlige brukere (ikke admin) påvirkes ikke

### Filer
- Ny migrasjon (1 fil, kun SQL)

