

## Automatisk admin-rolle ved godkjenning

### Bakgrunn
I dag får alle nye brukere rollen "lesetilgang" ved registrering (via en database-trigger `handle_new_user`). Nar en admin godkjenner brukeren, endres kun `approved`-flagget -- rollen forblir "lesetilgang".

Onsket endring: Nar en bruker godkjennes (`approved` settes til `true`), skal rollen automatisk oppgraderes til `admin`.

### Plan

**1. Opprett en database-trigger som lytter pa godkjenning**

Ny SQL-migrasjon som:
- Oppretter en funksjon `auto_assign_admin_on_approval()` som kjorer nar `profiles.approved` endres fra `false`/`null` til `true`
- Funksjonen oppdaterer eksisterende rolle i `user_roles` til `'admin'` (bruker `UPDATE` siden brukeren allerede har en rad fra registreringstrigger)
- Fallback: Hvis ingen rad finnes, gjores en `INSERT` med `ON CONFLICT DO NOTHING`
- Oppretter en trigger `trigger_auto_assign_admin_on_approval` pa `profiles`-tabellen

Ingen endringer i frontend-kode er nodvendig -- dette skjer helt pa databasenivå.

### Tekniske detaljer

```text
SQL-migrasjon:

1. CREATE FUNCTION auto_assign_admin_on_approval()
   - Sjekker: OLD.approved IS DISTINCT FROM true AND NEW.approved = true
   - Kjorer: UPDATE user_roles SET role = 'admin' WHERE user_id = NEW.id
   - Fallback INSERT ... ON CONFLICT (user_id) DO UPDATE SET role = 'admin'

2. CREATE TRIGGER trigger_auto_assign_admin_on_approval
   AFTER UPDATE OF approved ON public.profiles
   FOR EACH ROW
   EXECUTE FUNCTION auto_assign_admin_on_approval()
```

### Berørte filer
- Kun ny SQL-migrasjon (ingen frontend-endringer)

### Viktig merknad
- Eksisterende brukere som allerede er godkjent berores ikke
- Nye brukere far fortsatt "lesetilgang" ved registrering, men oppgraderes til "admin" ved godkjenning
- Superadmins kan fortsatt manuelt endre roller i admin-panelet etter godkjenning
