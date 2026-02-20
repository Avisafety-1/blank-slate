
## Mål
Sende en ny bekreftelses-e-post til `troyjensenkleppe@icloud.com` slik at han kan bekrefte e-posten sin og logge inn.

## Hvordan det fungerer
Supabase sin `auth.admin.generateLink({ type: 'signup' })` genererer en ny bekreftelses-lenke for en eksisterende, ubekreftet bruker. Vi sender denne via den eksisterende e-postinfrastrukturen med selskapets maler.

## Brukerinfo
- **ID:** `8662b572-fed6-475e-ac39-80cfc6b6a264`
- **Navn:** Troy Jensen Kleppe
- **Selskap-ID:** `0867b638-2a5b-4532-ade0-7cbeb49fac2f`
- **Status:** Ikke bekreftet, men godkjent

## Løsning: Ny edge function `resend-confirmation-email`

En ny edge function som:
1. Tar imot `userId` som parameter
2. Henter brukerens e-post og profil (navn, selskap) via `auth.admin`
3. Genererer en ny bekreftelses-lenke via `supabase.auth.admin.generateLink({ type: 'signup', email })`
4. Sender e-posten via eksisterende e-postmal-infrastruktur (`getEmailTemplateWithFallback` med type `user_welcome` eller en passende mal) med bekreftelses-lenken inkludert
5. Kalles umiddelbart for Troy sin bruker

## Alternativt (enklere)
Bruke Supabase sin innebygde `auth.admin.inviteUserByEmail()` – men dette oppretter ny invitasjon og kan overskrive eksisterende bruker.

Den sikreste løsningen er `generateLink({ type: 'signup' })` som genererer en ny gyldig token uten å påvirke brukerdata.

## Filer som endres/opprettes

| Fil | Endring |
|-----|---------|
| `supabase/functions/resend-confirmation-email/index.ts` | Ny edge function |
| `src/components/admin/CustomerDetailDialog.tsx` eller brukeradmin-UI | Knapp for å sende ny bekreftelse (valgfritt — kan også kalles direkte nå) |

## Umiddelbar handling
Etter at funksjonen er deployet, kalles den direkte for Troy sin bruker-ID slik at e-posten sendes med én gang.
