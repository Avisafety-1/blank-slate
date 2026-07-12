## Mål
La superadmins (Avisafe) velge et **default språk** (no/en) når de oppretter et nytt selskap. Dette språket brukes som initielt UI-språk og e-postspråk for brukere som melder seg på selskapet — de kan fortsatt bytte språk senere via sin egen profil.

## Endringer

### 1. DB-migrasjon (`companies.default_language`)
- Legg til kolonne `default_language text NOT NULL DEFAULT 'no'` med CHECK `IN ('no','en')`.
- Oppdater `handle_new_user()`-triggeren: når en ny profil opprettes for et selskap og `preferred_language` ikke allerede er satt fra metadata, fall tilbake til `companies.default_language` for det aktuelle selskapet.

### 2. `CompanyManagementDialog.tsx`
- Legg til `default_language: z.enum(['no','en']).default('no')` i `companySchema` og i `defaultValues`/`form.reset` (både create og edit).
- Skriv feltet til `companyData.default_language` ved insert/update.
- Rendre en RadioGroup «Norsk / English» **kun** hvis `isSuperAdmin` (Avisafe-rollen). Under redigering forhåndsutfyll fra eksisterende verdi; skjul feltet for ikke-superadmins slik at det ikke vises for vanlige admins.

### 3. Signup-flyt (`src/pages/Auth.tsx`)
- Etter at `get_company_by_registration_code` returnerer selskapet, hent `default_language` (utvid RPC-svaret eller gjør en ekstra `companies.select('default_language')` for koden brukeren skriver inn).
- Kall `changeLanguage(company.default_language)` slik at:
  - Resten av signup-siden vises på riktig språk.
  - `signUp`-metadata inkluderer `preferred_language: company.default_language` (leses av `handle_new_user`).
  - Bekreftelses/velkomst-e-post sendes på selskapets språk (via eksisterende `invokeEmailFunction`, som plukker opp `i18n.language`).

### 4. `invite-user` edge function
- Slå opp `default_language` fra mål-selskapet (`registration_code → companies.default_language`) og send den som `language` til `send-user-welcome-email`/invite-eposten dersom kall-språk ikke er eksplisitt satt. Dette sikrer at inviterte får e-post på selskapets språk selv om avsender bruker et annet UI-språk.

### 5. i18n-nøkler
- Legg til nye nøkler i **både** `no.json` og `en.json` under `admin.companyDialog`:
  - `defaultLanguage` («Standardspråk» / «Default language»)
  - `defaultLanguageDesc` (kort forklaring)
  - `languageNorwegian`, `languageEnglish`

### 6. Types
- `src/integrations/supabase/types.ts` regenereres automatisk etter migrasjonen; ingen manuelle endringer.

## Filer som endres
- `supabase/migrations/<ny>.sql` (kolonne + trigger-oppdatering)
- `src/components/admin/CompanyManagementDialog.tsx`
- `src/pages/Auth.tsx`
- `supabase/functions/invite-user/index.ts`
- `src/i18n/locales/no.json`, `src/i18n/locales/en.json`

## Ute av scope
- Ingen endring på eksisterende selskaper (defaulter til `'no'`).
- Ingen ny UI for å masse-endre eksisterende brukeres språk.
- Auth-emails håndtert av Supabase (signup confirm) forblir som i dag — kun Lovable/Resend-drevne e-poster påvirkes av `default_language`.
