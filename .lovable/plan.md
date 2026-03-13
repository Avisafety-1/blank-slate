

## Fiks: Duplikat user_roles-innsetting ved registrering

### Problem
`handle_new_user()` gjør to ting:
1. INSERT INTO profiles → dette trigger `handle_new_profile_role()` som setter inn i `user_roles`
2. INSERT INTO user_roles → dette feiler fordi raden allerede finnes (unique constraint på `user_id`)

Resultatet er "database error saving new user" for alle nye registreringer.

### Løsning
Fjern den overflødige `INSERT INTO user_roles` fra `handle_new_user()`-funksjonen. `handle_new_profile_role()`-triggeren på profiles-tabellen håndterer allerede rolletildelingen.

### Migrasjon
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.raw_user_meta_data->>'company_id' IS NOT NULL THEN
    INSERT INTO public.profiles (id, full_name, company_id, email, approved)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      (NEW.raw_user_meta_data->>'company_id')::uuid,
      NEW.email,
      false
    );
    -- Removed duplicate INSERT INTO user_roles here.
    -- The on_profile_created_assign_role trigger handles this automatically.
  END IF;
  RETURN NEW;
END;
$$;
```

Ingen frontend-endringer nødvendig.

