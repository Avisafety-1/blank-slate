## Problem

Etter at SMTP-kolonnene ble droppet fra `email_settings`, refererer `supabase/functions/_shared/email-config.ts` fortsatt til `smtp_user` i SELECT-spørringen. Når `send-password-reset` kalles med en bruker som har en `company_id`, feiler `getEmailConfig` fordi kolonnen ikke finnes lenger — feilen oppstår før `sendEmail` kjøres, så ingen mail går ut. Edge-loggene viser bare "booted" uten Resend-aktivitet, noe som bekrefter dette.

Dette er den eneste gjenværende stale referansen i kodebasen (sjekket alle edge functions og frontend).

## Endring

Fil: `supabase/functions/_shared/email-config.ts`

1. Endre SELECT fra `'from_name, from_email, smtp_user, enabled'` til `'from_name, from_email, enabled'`.
2. Fjern `|| emailSettings.smtp_user` fra fallback-uttrykket — bare bruk `from_email`.

Ingen andre filer eller migrasjoner trengs. `send-password-reset` (og alle andre edge-funksjoner som bruker `getEmailConfig`, f.eks. `resend-confirmation-email`, notifikasjoner) vil da virke igjen.

## Verifisering

Etter fix: trykk "Send ny link" i passord-tilbakestilling og sjekk at e-posten kommer frem, samt at edge-loggene viser at Resend-kallet faktisk kjører.