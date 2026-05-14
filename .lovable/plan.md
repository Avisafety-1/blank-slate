## Problem

Lagring av oppdrag feiler med:
```
column "phone" does not exist (42703)
```

Årsak: Triggeren `public.sync_mission_map_publication()` (lagt til i forrige migrasjon for kart-publisering) leser pilotens kontaktinfo med `SELECT phone, email FROM public.profiles`. Men kolonnen i `profiles` heter `telefon` — ikke `phone`. Triggeren kjører på hver INSERT/UPDATE på `missions`, så all oppdragslagring blokkeres.

Dette er ikke relatert til konfliktvarselet (steg 5) — det er steg 1-triggeren som har feil kolonnenavn.

## Endring

Én migrasjon: erstatt funksjonen `public.sync_mission_map_publication()` med samme kropp, men endre linje 73 fra:

```sql
SELECT phone, email, COALESCE(...) INTO v_phone, v_email, v_name
  FROM public.profiles WHERE id = NEW.user_id;
```

til:

```sql
SELECT telefon, email, COALESCE(NULLIF(trim(full_name), ''), NULLIF(trim(display_name), '')) 
  INTO v_phone, v_email, v_name
  FROM public.profiles WHERE id = NEW.user_id;
```

Ingen andre endringer — RLS, trigger-binding og resten av funksjonen forblir identisk. Ingen frontend-endringer.

## Verifisering

- Opprett nytt oppdrag → lagrer uten feil.
- Rediger eksisterende oppdrag → lagrer uten feil.
- Sjekk at `mission_map_publications.public_contact_phone` blir fylt ut korrekt når `share_contact_info=true` og `anonymous_publish=false`.
