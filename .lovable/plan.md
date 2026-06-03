## Problem

`public.get_user_visible_company_ids(uuid)` returnerer `uuid[]` (array), ikke en tabell. Migrasjonen brukte:

```sql
_from_company_id NOT IN (
  SELECT company_id FROM public.get_user_visible_company_ids(_caller)
)
```

Det er ingen kolonne `company_id` på en array — derav feilen.

## Fiks

Én ny migrasjon: `CREATE OR REPLACE FUNCTION public.transfer_drone(...)` identisk med forrige versjon, men admin-sjekken endres til array-syntaks:

```sql
IF NOT _is_superadmin THEN
  IF NOT _is_admin
     OR NOT (_from_company_id = ANY (public.get_user_visible_company_ids(_caller)))
  THEN
    RAISE EXCEPTION 'Only admins of the source department can transfer this drone';
  END IF;
END IF;
```

Alt annet i RPC-en beholdes ordrett. Ingen UI-/kodeendringer.