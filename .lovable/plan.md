# Tospråklige e-postmaler i edge functions

## Mål

Alle e-poster fra edge functions kan sendes på både norsk og engelsk, valgt automatisk basert på mottakerens språk. Nye kodere følger regelen i `mem://preferences/i18n-mandatory` også for e-post.

## Nåværende situasjon

- 11 edge functions sender e-post – alle hardkoder norsk innhold.
- `_shared/template-utils.ts` inneholder 13 `defaultTemplates` (kun norsk).
- Selskap kan overstyre maler via `email_templates`-tabellen – én rad per (`company_id`, `template_type`), språk-agnostisk.
- Klient-vendte feilmeldinger fra funksjonene er hardkodet norsk.

## Løsning

### 1. Datamodell (én migrasjon)

Utvid `email_templates` med `language`-kolonne:

```sql
ALTER TABLE public.email_templates
  ADD COLUMN language text NOT NULL DEFAULT 'no'
  CHECK (language IN ('no', 'en'));

-- Fjern gammel unique, lag ny composite:
ALTER TABLE public.email_templates
  DROP CONSTRAINT IF EXISTS email_templates_company_id_template_type_key;

ALTER TABLE public.email_templates
  ADD CONSTRAINT email_templates_company_type_lang_unique
  UNIQUE (company_id, template_type, language);
```

Eksisterende rader beholder `language='no'` – ingen data-migrering nødvendig.

### 2. Delt språk-modul: `_shared/email-i18n.ts`

Ny fil med:
- `type EmailLanguage = 'no' | 'en'`
- `resolveLanguage(req, body)` – leser i denne rekkefølgen: `body.language`, `Accept-Language`-header, brukerens `profiles.preferred_language` (om `user_id` er kjent), fallback `'no'`.
- `apiMessages: Record<EmailLanguage, Record<string, string>>` – for klient-vendte API-svar (feilmeldinger, "Hvis e-posten finnes..."-svar osv.).

### 3. Del opp `defaultTemplates`

Endre `_shared/template-utils.ts`:
- `defaultTemplates` blir `Record<EmailLanguage, Record<string, {subject, content}>>`.
- Alle 13 maler får engelsk tvilling (samme struktur, oversatt innhold – "Hei" → "Hi", "Med vennlig hilsen" → "Best regards", knappe-tekster osv.).
- `getEmailTemplateWithFallback(companyId, templateType, variables, language)` – henter fra DB med `.eq('language', language)`, faller tilbake til DB `'no'`, deretter `defaultTemplates[language]`, deretter `defaultTemplates['no']`.

### 4. Oppdater alle 11 funksjoner

For hver av `send-user-welcome-email`, `send-customer-welcome-email`, `send-user-approved-email`, `send-password-reset`, `invite-user`, `resend-confirmation-email`, `send-notification-email`, `send-feedback`, `preview-currency-emails`, `send-template-previews`, `test-email`:
- Les `language` fra request body (default `'no'`).
- Send `language` videre til `getEmailTemplateWithFallback`.
- Erstatt hardkodede fallback-strenger (f.eks. i `send-user-approved-email` linje 35-36) og klient-vendte feilstrenger (f.eks. `"E-post er påkrevd"`) med `apiMessages[language]`.
- Behold `fromName` = "AviSafe" (varemerke, ikke oversettes).

### 5. Klient-kallere

Alle kall til disse edge functions oppdateres til å sende `language: i18n.language`:
- `supabase.functions.invoke('send-user-welcome-email', { body: { ..., language: i18n.language } })`
- Samme for de andre. `i18n.language` er allerede `'no'` eller `'en'`.

### 6. Admin-UI for `email_templates` (kort utvidelse)

`EmailTemplateEditor.tsx` får språk-velger (radio: Norsk/English) som styrer hvilken rad som redigeres. Ved lagring skrives (`company_id`, `template_type`, `language`)-rad via upsert. Ingen språk-obligatorisk – hvis kun norsk finnes, sendes norsk til alle mottakere; hvis begge finnes, velges basert på `body.language`.

### 7. Referansedokument oppdateres

`docs/i18n-migration-status.md` – Fase 5.3 utvides med e-post-arbeid. `mem://preferences/i18n-mandatory` punkt 6 oppdateres når arbeidet er ferdig.

## Utenfor scope

- Automatisk maskinoversettelse av eksisterende brukertilpassede maler i DB (selskap må selv legge inn engelsk versjon hvis ønsket).
- Andre språk enn `no`/`en` – legges lett til senere via samme mønster.
- Endringer i Lovable Auth Email Templates (`auth-email-hook`) – ikke aktivert i dette prosjektet.

## Teknisk sjekkliste

- [ ] Migrasjon: `language`-kolonne + composite unique
- [ ] `_shared/email-i18n.ts` med `resolveLanguage` og `apiMessages`
- [ ] `_shared/template-utils.ts`: split `defaultTemplates` per språk + engelsk oversettelse av alle 13 maler
- [ ] 11 edge functions oppdatert
- [ ] Klient-kallere sender `language: i18n.language`
- [ ] `EmailTemplateEditor.tsx` med språkvelger
- [ ] `bunx tsgo --noEmit` grønn
- [ ] Deploy edge functions
- [ ] Manuell test: send test-email med `language: 'en'` og verifiser engelsk innhold

## Estimert omfang

~14-16 filer, én DB-migrasjon. Kan gjøres i én økt uten problemer, men skal jeg dele i to steg (kjerne-infra + oversettelser i steg 1, klient-oppdateringer + admin-UI i steg 2) hvis du foretrekker mindre PR-er?
