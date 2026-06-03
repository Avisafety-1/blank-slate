## Problem

`transfer_drone` RPC avviser med "Only admins of the source department can transfer this drone" fordi admin-sjekken bruker feil tabell/verdier.

Faktisk lagring i prosjektet:
- Globale roller ligger i `user_roles.role` med verdier som `administrator`, `admin`, `superadmin`, `bruker`, m.fl.
- `user_companies.role` brukes som tilhørighetsrolle (typisk `member`) — ikke admin-flagg.
- `support@avisafe.no` har `user_roles.role = 'administrator'` og `profiles.company_id = 5730368c…` (Avdeling Trondheim, under Moderavdeling).

Dagens RPC sjekker derimot:
```sql
EXISTS (SELECT 1 FROM user_companies
        WHERE user_id=_caller AND company_id=_from_company_id
          AND role IN ('admin','superadmin'))
```
Det returnerer alltid `false` for vanlige administratorer → feilmeldingen.

## Fiks

Erstatt admin-sjekken i `public.transfer_drone` med en sjekk som matcher faktisk rollemodell:

1. `_is_superadmin := public.has_role(_caller,'superadmin'::app_role)` — uendret.
2. Ny `_is_admin` som er sann hvis brukeren har en av rollene `admin` / `administrator` / `superadmin` i `user_roles`.
3. Hent `_caller_company := profiles.company_id` for den innloggede.
4. Hent listen `_visible := get_user_visible_company_ids(_caller)` (samme hierarki-funksjon som brukes ellers).
5. Tillat overføring hvis:
   - `_is_superadmin`, **eller**
   - `_is_admin` AND `_from_company_id = ANY(_visible)` (admin i hierarkiet drona tilhører).
6. Beholde eksisterende sjekk om at `_from_root = _to_root` (samme hierarki) for ikke-superadmins.

Ingen andre deler av RPC'en endres. UI uberørt.

### Teknisk diff (kun de relevante linjene)

```sql
-- Erstatt linjene 54-64:
_is_superadmin := public.has_role(_caller,'superadmin'::app_role);

SELECT EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_id = _caller
    AND role::text IN ('admin','administrator','superadmin')
) INTO _is_from_admin;

IF NOT _is_superadmin THEN
  IF NOT _is_from_admin
     OR _from_company_id <> ALL (
        SELECT company_id FROM public.get_user_visible_company_ids(_caller)
     )
  THEN
    RAISE EXCEPTION 'Only admins of the source department can transfer this drone';
  END IF;
END IF;
```

(Returtypen til `get_user_visible_company_ids` verifiseres i migrasjonen — hvis den returnerer `setof uuid` brukes `_from_company_id NOT IN (SELECT … )` direkte.)

## Migrasjon

Én migrasjon som kjører `CREATE OR REPLACE FUNCTION public.transfer_drone(...)` med oppdatert admin-sjekk. Alt annet i funksjonen beholdes uendret (FOR UPDATE-lås, target-validering, _actions-validering, per-ressurs eierskap, logging, drone_transfers-innsetting).

## Verifisering etterpå

- `support@avisafe.no` (administrator i Avdeling Trondheim-hierarkiet) skal kunne flytte drone mellom søsteravdelinger.
- Bruker uten `admin`/`administrator`/`superadmin` skal fortsatt få avslag.
- Superadmin skal kunne flytte på tvers av hierarkier som før.
