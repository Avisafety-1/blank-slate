

## Problem

Nye brukere som registrerer seg via **Google OAuth** får ikke rolle i `user_roles`-tabellen. Dette skjer fordi:

1. `handle_new_user`-triggeren (på `auth.users`) sjekker `raw_user_meta_data->>'company_id'` — Google OAuth-brukere har ikke dette feltet, så triggeren hopper over dem
2. Frontend-koden i `Auth.tsx` prøver å inserte `'bruker'`-rollen direkte fra klienten (linje 360-365), men **RLS-policyen krever at brukeren allerede har admin-rolle** for å inserte i `user_roles` — noe en helt ny bruker ikke har
3. Resultatet: rollen blir aldri opprettet, og brukeren vises med "blank" rolle i admin-panelet

For e-postregistrering fungerer det fordi triggeren kjører som `SECURITY DEFINER` (bypasser RLS) og inserter `'administrator'`.

**Tilleggsproblem**: Google OAuth-brukere får rollen `'bruker'` i stedet for `'administrator'`, som er standarden for nye brukere.

## Løsning

To endringer:

### 1. Database: Ny trigger på `profiles`-tabellen
Opprett en trigger som automatisk tildeler `'administrator'`-rolle når en ny profil opprettes, **dersom brukeren ikke allerede har en rolle**. Triggeren kjører som `SECURITY DEFINER` og bypasser RLS.

```sql
CREATE OR REPLACE FUNCTION public.handle_new_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO user_roles (user_id, role) VALUES (NEW.id, 'administrator');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_created_assign_role
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_profile_role();
```

### 2. Frontend: Fjern manuell rolle-insert fra Google OAuth-flyten
I `Auth.tsx`, fjern den manuelle `user_roles`-inserten i `handleGoogleRegistrationSubmit` (linje 359-365) — triggeren håndterer dette nå.

### Filer
- **Database**: Ny migrasjon med trigger
- **`src/pages/Auth.tsx`**: Fjern rolle-insert i Google-registrering

