

## Gi tilbakemelding-knapp i Min profil

### Oversikt
Legger til en "Gi tilbakemelding"-knapp i profildialogen som åpner en ny dialog med overskrift og tekstfelt. Når brukeren trykker "Send", sendes innholdet som e-post til kontakt@avisafe.no via en ny edge function.

### Endringer

**1. Ny Edge Function: `send-feedback`**
- Ny fil: `supabase/functions/send-feedback/index.ts`
- Mottar `subject`, `message`, og valgfritt `senderName` og `senderEmail` fra request body
- Bruker standard SMTP-oppsett (via `_shared/email-config.ts` uten companyId, slik at den faller tilbake til standard AviSafe SMTP)
- Sender e-post til `kontakt@avisafe.no` med brukerens tilbakemelding
- Inkluderer avsenderens navn og e-post i e-postinnholdet slik at mottaker kan svare

**2. Oppdatering av `supabase/config.toml`**
- Legger til `[functions.send-feedback]` med `verify_jwt = false` (validerer auth i koden)

**3. Oppdatering av `src/components/ProfileDialog.tsx`**
- Legger til ny state for tilbakemeldingsdialogen (`feedbackOpen`, `feedbackSubject`, `feedbackMessage`, `feedbackSending`)
- Legger til en "Gi tilbakemelding"-knapp med `MessageSquare`-ikonet (allerede importert) nederst i profil-fanen, under signatur-seksjonen
- Ny `Dialog` med:
  - Overskrift-felt (Input)
  - Meldingstekst (Textarea)
  - "Avbryt" og "Send" knapper i footer
- Send-funksjonen kaller `supabase.functions.invoke('send-feedback', ...)` med validering (begge felt må fylles ut)
- Viser toast ved suksess/feil

### Tekniske detaljer

**Edge function (`send-feedback/index.ts`):**
```text
- CORS headers
- Autentiserer brukeren via Authorization header
- Henter brukerens profil (navn, e-post) fra Supabase
- Validerer at subject og message ikke er tomme, med lengdebegrensninger
- Bygger HTML-e-post med brukerinfo og melding
- Sender til kontakt@avisafe.no via standard SMTP
```

**Profildialog-knapp plassering:**
- Plasseres som en `Separator` + ny seksjon etter signatur-blokken i profil-fanen
- Knappen er alltid synlig (ikke bare i redigeringsmodus)

