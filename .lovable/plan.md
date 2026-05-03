## Mål
Hver mandag kl. 07:00 (Europe/Oslo) sender systemet en automatisk ukesrapport på e-post:
- **Mor-selskap admins**: rapport for **hele konsernet** (mor + alle avdelinger)
- **Avdeling-admins**: rapport for **kun sin egen avdeling**
- **Frittstående selskap admins**: rapport for eget selskap

## Innhold i rapporten
1. **Aktivitet forrige uke (man–søn)**
   - Antall oppdrag (planlagt / fullført / kansellert) + endring vs uka før
   - Totale flytimer (sum `flight_logs.flight_duration_minutes`) + endring vs uka før
   - Antall flyvninger
   - For konsernrapport: brytes ned per avdeling i en liten tabell
2. **Avvik & hendelser**
   - Nye `incidents` siste 7 dager, gruppert på alvorlighetsgrad
   - Antall åpne totalt
3. **Vedlikehold & forfall (forfalt + neste 30 dager)**
   - Droner: `neste_inspeksjon` + timer/oppdrag-baserte intervaller
   - Utstyr: `neste_vedlikehold`
4. **Dokumenter med utløp (forfalt + neste 30 dager)**
   - `documents.gyldig_til`
5. **Personell-kompetanser (forfalt + neste 30 dager)**
   - `personnel_competencies.gyldig_til` + navn fra `profiles`

Tomme seksjoner vises som grønn "alt OK". Hvis hele rapporten er tom for uka, sendes ingen e-post.

## Mottaker- og scope-logikk

```text
For hvert selskap C i companies:
  admins = user_roles where role in ('admin','administrator','superadmin')
           join profiles on user_id, filtered by company

  if C.parent_company_id IS NULL:
    # Mor-selskap (eller frittstående)
    scope_company_ids = [C.id] + alle barn av C
    rapport = aggregert over scope_company_ids
    send til: admins i C
  else:
    # Avdeling
    scope_company_ids = [C.id]
    rapport = kun C
    send til: admins i C (ikke mor-admins – de får konsernrapporten)
```

Resultat: mor-admin får én konsernrapport, avdeling-admin får én avdelingsrapport. Bruker som er admin både i mor og avdeling får begge (forskjellig `idempotencyKey`).

`suppressed_emails` respekteres automatisk via `send-transactional-email`.

## Teknisk arkitektur

### 1. E-post-template
`supabase/functions/_shared/transactional-email-templates/weekly-company-report.tsx`
- React Email-komponent, mørk Avisafe-header + lyse seksjonskort
- Props: `{ companyName, scopeLabel, weekRange, stats, departmentBreakdown?, incidents, maintenance, documents, competencies }`
- `scopeLabel` = "Konsern" | "Avdeling" | "Selskap"
- `departmentBreakdown` vises kun for konsernrapport
- Subject: `Ukesrapport {companyName} ({scopeLabel}) – uke {n}`
- Registreres i `registry.ts`

### 2. Edge Function `weekly-company-report`
`supabase/functions/weekly-company-report/index.ts`
- Service role-klient
- Henter alle `companies`
- For hvert selskap bestemmer scope (mor → konsern, avdeling → seg selv)
- Aggregerer fra `missions`, `flight_logs`, `incidents`, `drones`, `equipment`, `documents`, `personnel_competencies` mot scope-listen og forrige ISO-uke
- Henter admin-mottakere (rolle admin/administrator/superadmin) join `profiles.email`
- Sender via eksisterende `_shared/resend-email.ts` (samme mønster som dagens transaksjons-e-poster)
- `idempotencyKey` per mottaker: `weekly-{companyId}-{userId}-{isoYear}W{isoWeek}` lagres i ny tabell `weekly_report_sends` for å hindre dobbeltsending ved manuell re-kjøring
- Body-param `dryRun: true` returnerer bare hva som ville blitt sendt
- Body-param `companyId: '...'` for å teste én bedrift
- Returnerer summary `{ companies, recipients, sent, skipped, errors }`

### 3. Avmelding per bruker
Ny kolonne `profiles.weekly_report_unsubscribed boolean default false`. 
- Edge Function hopper over mottakere med `true`
- Avmeldingslenke i e-posten: `https://app.avisafe.no/unsubscribe-weekly?token=...` håndteres av ny enkel Edge Function `unsubscribe-weekly-report` som validerer signert token (HMAC av user_id + epost-secret) og setter flagget
- I tillegg kan bruker toggle i Profil-innstillinger (egen liten oppgave hvis ønsket)

### 4. UI – Avisafe superadmin
Nytt kort i `MarketingSettings.tsx`:
- "Ukesrapport – auto mandag 07:00 (Europe/Oslo)" status-badge
- Knapp **"Send testrapport for forrige uke nå"** → invokerer funksjonen med `dryRun: false`
- Valgfritt selskaps-dropdown for å teste én bedrift først
- Viser summary etter kjøring

### 5. Cron-jobb
DB-migrering med `pg_cron`:
```sql
select cron.schedule(
  'weekly-company-report',
  '0 6 * * 1',  -- mandag 06:00 UTC ≈ 07:00 vinter / 08:00 sommer Oslo
  $$ select net.http_post(
       url := '<edge-fn-url>',
       headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', <vault>),
       body := '{}'::jsonb
     ) $$
);
```
Vault-secret `weekly_report_cron_secret` valideres i Edge Function.

For å treffe 07:00 Oslo året rundt vurderer vi to cron-jobber (vinter 06:00 UTC, sommer 05:00 UTC) — eller godtar 07:00/08:00-glipp. **Standard: én jobb 06:00 UTC** (matcher dagens NOTAM-cron-mønster). Si fra hvis du vil ha presist 07:00 lokalt året rundt.

## Filer/endringer
- `supabase/functions/_shared/transactional-email-templates/weekly-company-report.tsx` (ny)
- `supabase/functions/_shared/transactional-email-templates/registry.ts` (oppdatert)
- `supabase/functions/weekly-company-report/index.ts` (ny)
- `supabase/functions/unsubscribe-weekly-report/index.ts` (ny)
- `src/components/marketing/MarketingSettings.tsx` (testkort)
- DB-migrering: `weekly_report_sends`-tabell, `profiles.weekly_report_unsubscribed`-kolonne, vault-secret, pg_cron-schedule

## Avklaring – sender-vei
Prosjektet bruker i dag **Resend HTTP API direkte** (`_shared/resend-email.ts`), ikke Lovable Emails-køen. Jeg foreslår samme vei her for konsistens — vi rendrer React Email-templaten med `@react-email/render` til HTML og sender via `sendEmail()`. Si fra hvis du heller vil migrere til Lovable Emails-infrastrukturen (gir innebygd retry/suppression-kø, men krever større oppsett).
