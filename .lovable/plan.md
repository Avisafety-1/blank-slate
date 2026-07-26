# Compliance & Audit – Fase 2 (revidert plan)

## Funn fra schema- og arkitekturgjennomgang

Bekreftet i faktisk kodebase (ikke antatt):

- **Company-scope**: RPC `get_user_visible_company_ids(_user_id)` er standardmønsteret (se `useStatusData.fetchPersonnel`, `_shared/companyScope.ts`). Mor/datter håndteres via `companies.parent_company_id` + `propagate_*`-flagg.
- **Superadmin-bypass**: `user_roles.role='superadmin'` sjekkes i `assertUserInCompany`.
- **Relevante eksisterende tabeller**: `profiles`, `personnel_competencies`, `drones` (m/ `neste_inspeksjon`, `flyvetimer`, `inspection_interval_*`, `varsel_*`, `hours_at_last_inspection`), `drone_inspections`, `drone_accessories`, `drone_equipment`, `equipment`, `missions`, `mission_sora`, `mission_risk_assessments`, `mission_deviation_reports`, `mission_personnel`, `flight_logs`, `incidents`, `incident_comments`, `documents` (allerede rik: kategori, versjon, gyldig_til, visibility, company_id, visible_to_children).
- **React Query-mønster**: `useQueries`, `queryKey` inkluderer `companyId`, `staleTime: 5000`, PostgREST nested selects.
- **Storage**: private buckets, `createSignedUrl(path, seconds)` — brukes for `documents`, `changelog-images`, `flight-logs`. Bruk samme mønster; ingen public URL.
- **Routing**: `/oppdrag`, `/ressurser`, `/dokumenter`, `/hendelser`, `/status`, `/admin` — deep links går til disse eksisterende sidene med query-params.
- **i18n**: obligatorisk – alle nye strenger i `no.json` og `en.json`.

## Justeringer av opprinnelig forslag

1. **`compliance_documents` opprettes IKKE.** Eksisterende `public.documents` dekker allerede id, kategori, versjon, gyldig_til, ansvarlig, filhåndtering, company_id, visible_to_children og varsel_dager_for_utløp. Audit-modulen leser fra `documents` og lager kun et view/hook over dette. Sparer duplisering av opplasting og RLS.
2. **Legger til `compliance_finding_dispositions`** (foreslått som valgfritt) – nødvendig for at brukere skal kunne skjule/akseptere scanner-funn (code+entity_id+company_id).
3. **`audit_checklist_items` som egen tabell** i stedet for jsonb-array (nåværende mock lagrer bool[]) – gir bedre kobling til funn og evidence.
4. **Kompetanse leses fra `personnel_competencies`**, ikke fra ny tabell (brukes allerede i `useStatusData`).
5. **Flåte**: bruker eksisterende `drones` + `drone_inspections` + `drone_accessories`. Remote ID / firmware / batteri: kartlegg hvilke kolonner som faktisk finnes; det som mangler rapporteres som `unknown` (ikke `fail`).
6. **Ingen endring i eksisterende moduler** utover å akseptere query-params for deep links.

## Delfaser

### Fase A – Arkitektur, hooks & queries (ingen DB, ingen UI-endring ennå)

Struktur:
```text
src/components/admin/audit/
  components/  tabs/  data/  lib/  (eksisterende)
  hooks/       (nye React Query hooks)
  queries/     (rene supabase-kall)
  services/    (ComplianceEngine, ComplianceScanner, AuditInsightService)
  validators/  (én fil pr regelfamilie)
  utils/       (auditDeepLink, severity-sort, dato-utils)
  types.ts     (utvides: ScannerFinding, CheckResult, CategoryScore, DomainKpis)
```

Nye hooks (alle scoper via `get_user_visible_company_ids`):
- `useAuditKpis`, `useAuditCompetencies`, `useAuditFleet`, `useAuditOperations`, `useAuditSafety`, `useAuditDocuments` (leser eksisterende `documents`), `useAuditReviews`.

Alle hooks returnerer `{ data, isLoading, isError, isPartial, lastComputedAt }` slik at UI kan vise loading/error/empty/partial/permission-denied states.

### Fase B – DB-migrasjon (kun audit-egne tabeller)

Fem nye tabeller i `public`. Alle får: `company_id uuid not null`, `created_at`/`updated_at` + trigger, indekser på `company_id` og relevante FK, GRANT til `authenticated`+`service_role`, `ENABLE RLS`, policies via `company_id = ANY(get_user_visible_company_ids(auth.uid()))` og superadmin-bypass med `has_role`.

- `audit_reviews(id, company_id, title, type, scope jsonb, date, responsible_user_id, status: planned|in_progress|closed, closed_at, override_reason)`
- `audit_sections(id, review_id, company_id, section_key, comment, status)`
- `audit_checklist_items(id, section_id, company_id, label, order_index, result: pass|warn|fail|na|unknown, comment, evidence_path)`
- `audit_findings(id, company_id, review_id nullable, source_scanner_code nullable, category, description, reference, responsible_user_id, deadline, status: open|in_progress|verified|closed, verified_by, verified_at)`
- `audit_actions(id, finding_id, company_id, description, responsible_user_id, deadline, status: open|in_progress|closed, comment, closed_at, closed_by)`
- `audit_attachments(id, company_id, parent_type: review|finding|action|checklist_item, parent_id, storage_path, filename, mime_type, size_bytes, uploaded_by)`
- `compliance_finding_dispositions(id, company_id, finding_code, entity_type, entity_id, disposition: accepted|dismissed|snoozed, reason, snooze_until, created_by, created_at)` + UNIQUE(company_id, finding_code, entity_type, entity_id).

CHECK constraints unngås for tid; bruk validation-trigger (prosjektregel). Trigger som sjekker at child-rad har samme `company_id` som parent.

Storage: ny privat bucket `audit-attachments` (via `supabase--storage_create_bucket`). RLS på `storage.objects` scoper etter path-prefix `<company_id>/…` + `get_user_visible_company_ids`.

### Fase C – ComplianceEngine, Scanner, Validators, Insights

`services/ComplianceEngine.ts` – ren funksjon `evaluate(input): { overall: number|null, categories, dataQuality }`.
- Kategorier: `competence`, `documentation`, `fleet`, `operations`, `safety`.
- Hver kontroll returnerer `pass | warn | fail | na | unknown`.
- `na` og `unknown` teller ikke i score. Kategori uten kontroller → `score: null`.
- Overall = vektet snitt over kategorier med `score !== null` (relevant-vekting), ikke absolutt 20 %.
- Returnerer `dataQuality: { covered, unknown, na }` slik at UI viser tydelig at dette er en intern indikator.

`services/ComplianceScanner.ts` + `validators/*`:
- Interface: `Validator = { code, run(ctx): ScannerFinding[] }`.
- `ScannerFinding = { code, severity: critical|warning|info, titleKey, bodyKey, entityType, entityId, evidence, deepLink }`.
- Ingen brukerrettet tekst i kode – kun i18n-nøkler.
- Validatorer implementeres for reglene som faktisk har datagrunnlag: `competenceExpiringOrExpired`, `documentReviewOverdue`, `documentExpired`, `emergencyPlanMissing` (basert på `documents.kategori`), `droneServiceOverdue`, `droneInspectionOverdue`, `droneRemoteIdMissing` (kun hvis kolonne finnes, ellers hopp), `missionMissingRiskAssessment` (kun der `require_sora_on_missions` er på), `missionMissingChecklist`, `missionMissingDebrief`, `flightNotClosed`, `overdueAuditAction`, `findingAwaitingVerification`.
- Scanner respekterer `compliance_finding_dispositions` (dismissed/snoozed skjules eller nedgraderes).

`services/AuditInsightService.ts` – grensesnitt `getInsights(scannerFindings, kpis): Insight[]`. Foreløpig ren regelbasert (mock-tekster via i18n). Klart for GPT-erstatning.

### Fase D – UI-oppkobling (ingen redesign)

- `OverviewTab`: KPI fra `useAuditKpis`, ring fra engine (viser "N/A" hvis overall=null), `ComplianceAlertsPanel` (topp 10 scanner-funn med severity-emoji + deep link + "opprett formelt funn"-knapp), `AuditReadinessList` bygges fra scanner-funn, "Sist beregnet" timestamp + datakvalitet-strip.
- `CompetencyTab`, `FleetTab`, `OperationsTab`, `SafetyTab`: bytter mock → hooks. Viser 5 states: loading/error/empty/partial/permission-denied. Kolonner med manglende data viser "Ukjent".
- `DocumentationTab`: leser `documents` via hook.
- `InternalAuditsTab` + `AuditDetailDialog`: full CRUD mot audit-tabellene via React Query mutations. Kontrollpunkt-knapp "Opprett funn" konverterer scanner-funn eller manuelle observasjoner til `audit_findings`. Lukking av revisjon blokkeres hvis åpne kritiske funn – kan overstyres med begrunnelse.
- `AiAuditCard`: bruker `AuditInsightService`.
- `InspectionPackageTab`: knapp kaller edge function (fase E), viser progress + signed URL.

Sentral `utils/auditDeepLink.ts`:
- fleet/drone → `/ressurser?tab=drones&id=…`
- competence → `/ressurser?tab=personnel&id=…`
- mission → `/oppdrag?id=…`
- document → `/dokumenter?id=…`
- incident/action → `/hendelser?id=…`
Mottakersider aksepterer allerede tab/id-params der mulig; små justeringer legges til der de mangler.

Disclaimer-tekst (i18n): «Intern støtteindikator. Ikke en godkjenning fra Luftfartstilsynet.»

### Fase E – Tilsynspakke

Edge function `generate-inspection-package`:
- Auth + `assertUserInCompany`.
- Bygger PDF-oversikt (samme mønster som `oppdragPdfExport`), CSV (kompetanse, flåte, funn), JSON (rå data), `manifest.json`.
- Pakker som ZIP, laster opp til `audit-attachments/<company_id>/packages/<uuid>.zip`, returnerer 1 t signed URL.
- Første versjon: kun oversiktsdokumenter, ikke alle vedlegg.

### Fase F – Tester

`vitest` under `src/components/admin/audit/__tests__/`:
- ComplianceEngine: score-normalisering, `na`/`unknown`-håndtering, tomme datasett, alle-`na` → `null`.
- Hver validator: kjent input → forventede `ScannerFinding[]`.
- Severity-sortering og disposition-filtrering.
- `auditDeepLink` mapping.
- RLS cross-company: SQL-testrunde via egen migration/test-script (leser med to selskaper) – dokumenteres i `docs/security/`.

## i18n

Alle nye nøkler i `src/i18n/locales/no.json` og `en.json`. Ingen norsk/engelsk hardkoding i komponenter, validatorer eller services.

## Ikke i denne omgang

- Ekte GPT (kun grensesnitt).
- Versjonering av dokumenter (bruker eksisterende `documents.versjon`).
- Automatisk konvertering scanner→formelt funn.
- Samling av alle vedlegg i tilsynspakken.

## Leveranse pr fase

Etter hver delfase leveres kort oppsummering: undersøkt, gjenbrukt, justert, filer/migrations, RLS/sikkerhet, tester, kjente mangler, neste steg.
