

## Plan: Send kalender-abonnementslenke på e-post via SMTP (denomailer)

### Endringer

**1. Ny edge function `supabase/functions/send-calendar-link/index.ts`**
- Bruker denomailer/SMTPClient og eksisterende `getEmailConfig()` fra `_shared/email-config.ts` — samme mønster som alle andre e-postfunksjoner
- Mottar `{ userId, feedUrl, companyId }` fra frontend
- Henter brukerens e-post via `supabase.auth.admin.getUserById()`
- Sender en HTML-e-post med:
  - Klikkbar `webcal://`-lenke (erstatter `https://` med `webcal://`) som åpner kalenderappen direkte
  - Vanlig URL som backup
  - Instruksjoner for Google Calendar, iPhone og Outlook
- Bruker selskapets SMTP-konfigurasjon via `getEmailConfig(companyId)`

**2. `supabase/config.toml`** — Legg til `[functions.send-calendar-link]` med `verify_jwt = true`

**3. `src/components/dashboard/CalendarSubscriptionSection.tsx`**
- Legg til en "Send på e-post"-knapp (Mail-ikon) ved siden av kopier-knappen
- Kaller `supabase.functions.invoke('send-calendar-link', { body: { userId, feedUrl, companyId } })`
- Viser loading-state og suksess-toast

### Filer
1. `supabase/functions/send-calendar-link/index.ts` (ny)
2. `supabase/config.toml` (oppdater)
3. `src/components/dashboard/CalendarSubscriptionSection.tsx` (oppdater)

