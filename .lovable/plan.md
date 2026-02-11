

# Fix: E-post ved innsending til godkjenning feiler

## Problem
Nar du sender et oppdrag til godkjenning, feiler e-postvarslingen med "No content provided!" fordi malen `mission_approval_request` ikke finnes i standardmalene i `template-utils.ts`. Funksjonen `getEmailTemplateWithFallback` returnerer tom subject og content, og denomailer nekter a sende en e-post uten innhold.

Selve oppdateringen av oppdraget (status endres til `pending_approval`) fungerer - det er kun e-posten som feiler.

## Losning

### 1. Legg til standardmal `mission_approval_request` i `template-utils.ts`
Legge til en ny mal i `defaultTemplates`-objektet med variabler: `mission_title`, `mission_location`, `mission_date`, `mission_description`, `company_name`. Malen informerer godkjennere om at et oppdrag venter pa godkjenning.

### 2. Legg til fallback i `send-notification-email/index.ts`
I `notify_mission_approval`-handleren (linje 167), legge til en sjekk etter `getEmailTemplateWithFallback` som genererer inline HTML hvis innholdet er tomt - samme monster som allerede brukes for `notify_mission_approved` (linje 229-233).

## Tekniske detaljer

**Fil 1: `supabase/functions/_shared/template-utils.ts`**
- Legge til `mission_approval_request` i `defaultTemplates`-objektet med norsk tekst
- Subject: `Oppdrag venter pa godkjenning: {{mission_title}}`
- Innhold: HTML med oppdragstittel, lokasjon, tidspunkt, beskrivelse

**Fil 2: `supabase/functions/send-notification-email/index.ts`**
- Etter linje 167, legge til sjekk for tom `templateResult.content`
- Generere en enkel inline HTML-fallback med oppdragsinfo
- Sette default subject hvis tom

**Fil 3: Eventuelt feilhandtering i `src/pages/Oppdrag.tsx`**
- E-postfeilen fanges allerede i try/catch (linje 528), men `supabase.functions.invoke` returnerer feil i `data.error` uten a kaste exception - suksess-toasten vises uansett. Ingen endring nodvendig her, men kan forbedre logging.

