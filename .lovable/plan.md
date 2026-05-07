## Problem

Trigger `on_company_created_create_email_settings` på `companies`-tabellen kaller funksjonen `public.create_default_email_settings()`, som fortsatt prøver å sette inn `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_secure` i `email_settings`. Disse kolonnene ble fjernet da vi gikk over til Resend. Derfor feiler enhver `INSERT INTO companies` (= "legg til selskap") med "column smtp_host does not exist".

Gjenværende kolonner i `email_settings`: `id, company_id, from_name, from_email, enabled, created_at, updated_at`.

## Endring (én migrasjon)

Erstatt funksjonsdefinisjonen slik at den kun setter de kolonnene som finnes nå:

```sql
CREATE OR REPLACE FUNCTION public.create_default_email_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.email_settings (company_id, from_name, from_email, enabled)
  VALUES (NEW.id, 'AviSafe', 'noreply@avisafe.no', true)
  ON CONFLICT (company_id) DO NOTHING;
  RETURN NEW;
END;
$$;
```

Trigger beholdes som den er — den fyrer fortsatt `AFTER INSERT` på `companies` og oppretter en standardrad for det nye selskapet, bare uten de fjernede SMTP-feltene.

## Hvorfor ikke fjerne triggeren helt

`email_settings` brukes fortsatt av `_shared/email-config.ts` (`getEmailConfig`) for å hente `from_name` / `from_email` / `enabled` per selskap. Å beholde standardraden gjør at nye selskap automatisk får riktig avsender uten ekstra steg.

## Ingen frontend-endringer trengs

Søk i `src/` og `supabase/functions/` viser ingen referanser til `smtp_host` lenger — kun denne DB-funksjonen var igjen fra ryddingen.