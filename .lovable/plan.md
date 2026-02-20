
## Rotårsak: To problemer i `bulk_email_all_users`

### Problem 1: RLS blokkerer henting av alle brukere
I `bulk_email_all_users`-blokken (linje 357) brukes den vanlige Supabase-klienten initialisert med service role key — men `profiles`-tabellen har RLS-policyer som filtrerer på `company_id = get_user_company_id(auth.uid())`. Siden edge-funksjonen bruker `SUPABASE_SERVICE_ROLE_KEY` (ikke en brukers JWT), **bør** service role omgå RLS — men feilen kan komme av at `supabase`-klienten er initialisert uten en auth-header, slik at den kjører som `anon` istedenfor service-rolle. Dette er verdt å verifisere.

**Koden på linje 35:**
```typescript
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);
```
Dette ser riktig ut — service role key omgår normalt RLS.

### Problem 2: `getEmailConfig(undefined)` ved manglende `companyId`
Fra `BulkEmailSender.tsx` (linje 220-227) sendes `companyId` alltid med fra React-klienten. Men i edge-funksjonen på linje 356 er betingelsen `type === 'bulk_email_all_users' && subject && htmlContent` — **`companyId` er ikke i betingelsen**, men brukes direkte på linje 360:

```typescript
const emailConfig = await getEmailConfig(companyId); // companyId kan være gyldig her fra Avisafe-selskapet
```

Siden superadmin "står i Avisafe-selskapet", sendes `companyId = <avisafe-id>`. `getEmailConfig` henter da e-postinnstillingene for Avisafe-selskapet. **Problemet**: Hvis Avisafe-selskapet har en `email_settings`-rad med `enabled = true` men uten passord (`smtp_pass = null`), vil `getEmailConfig` falle tilbake til globale secrets. Hvis globale secrets heller ikke er satt, kastes en feil: `No email password configured`.

### Problem 3: `profiles.email`-feltet eksisterer ikke alltid
Linje 357 henter `select('email')` fra `profiles`, men e-postadresser er normalt lagret i `auth.users`, ikke i `profiles`. Linje 307 (`bulk_email_users`) gjør det samme. Dette returnerer null for alle og sender ingenting — eller krasjer hvis kolonnen ikke finnes.

---

## Løsningen

### Del 1: Hent e-poster via `auth.admin`-API for `bulk_email_all_users`
Istedenfor å hente `email` fra `profiles` (som kan mangle), hent alle brukere via `supabase.auth.admin.listUsers()` som garantert inneholder e-postadresser. Dette omgår også RLS-problematikken fullstendig.

### Del 2: Bruk alltid globale SMTP-innstillinger for `bulk_email_all_users`
For massepost til alle selskaper er det ikke riktig å bruke ett selskaps egne SMTP-innstillinger. Kall `getEmailConfig()` uten `companyId` (bruker globale miljøvariabler fra secrets) for `bulk_email_all_users`-typen.

### Del 3: Fiks `bulk_email_users` til å hente e-post fra auth.users
Samme problem gjelder for `bulk_email_users` og `bulk_email_customers` — bruk `auth.admin.getUserById` for hvert profil-ID, eller hent e-poster via `auth.admin.listUsers()` filtrert på selskap.

---

## Konkrete endringer i `supabase/functions/send-notification-email/index.ts`

**`bulk_email_all_users` (linje 356-379):**
- Bytt `supabase.from('profiles').select('email')` til `supabase.auth.admin.listUsers()` med paginering
- Bytt `getEmailConfig(companyId)` til `getEmailConfig()` (uten companyId = bruker globale SMTP-secrets)

**`bulk_email_users` (linje 306-329):**
- Behold henting av profil-IDs fra `profiles` (for company_id-filtrering)
- Hent e-post via `supabase.auth.admin.getUserById(profileId)` for hvert treff

**`bulk_email_customers` (linje 331-353):**
- Uendret — `customers.epost` er et eksplisitt felt, dette er ok.

---

## Filer som endres

| Fil | Endring |
|-----|---------|
| `supabase/functions/send-notification-email/index.ts` | Fiks `bulk_email_all_users` til å bruke `auth.admin.listUsers()` og globale SMTP. Fiks `bulk_email_users` til å hente e-post via `auth.admin.getUserById`. |
