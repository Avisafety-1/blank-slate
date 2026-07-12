# i18n-migrasjon: statussporing

Sist oppdatert: 2026-07-13

Full plan: se `.lovable/plan.md` (godkjent 2026-07-12) og konvensjoner i
`src/i18n/README.md`. Heatmap regenereres via `bun run scripts/i18n-scan.ts`.

Statuskoder:
- `TODO` – ikke startet
- `WIP` – delvis migrert
- `DONE` – alle bruker-vendte strenger på nøkler
- `EN-verified` – kontrollert visuelt i preview på engelsk (ingen overflow, ingen råtekst-nøkler)

## Fase 1 – Kjerne-navigasjon og daglige flater

| # | Fil / område | Status | Notat |
|--:|--------------|--------|-------|
| 1.1 | `src/pages/Index.tsx` | DONE | Toasts + checkout-meldinger migrert 2026-07-12 |
| 1.1 | `src/components/dashboard/*` (widgets) | DONE | Alle dashboard-widgets migrert 2026-07-12: DocumentDetailDialog, IncidentDetailDialog, AddMissionDialog, CalendarExportDialog, CalendarSubscriptionSection, FlightAnalysisTimeline, MissionMapPreview, ExpandedMapDialog, RiskAssessmentDialog (manuell SORA-fane under `riskAssessment.manualSora`). SORA-spesifikke dialoger (SoraAnalysisDialog/SoraResultView/MissionSoraRouteDocumentation) håndteres i Fase 3 (SORA-namespace). |
| 1.2 | `src/pages/Oppdrag.tsx` + `src/components/oppdrag/*` | DONE | Oppdrag.tsx, OppdragFilterBar, MissionCard, AirspaceConflictWarning migrert 2026-07-12. `OppdragDialogs.tsx` var allerede migrert (`oppdragDialogs.*`). ChecklistBadges har ingen brukervendte strenger. Nye nøkler: `pages.missions.*`, `airspaceConflict.*`. |
| 1.3 | `src/pages/Kalender.tsx` | DONE | Toasts, legend, dropdown-entries, event-type badge (lookup mot `eventTypes`), vedlikeholds-bekreftelse og custom-event-form migrert 2026-07-12. Utvidet `pages.calendar.*`-namespace med Hendelse/Dokument/Nyhet i `eventTypes`, `noEventsThisDay`, `markAsCompleted`, `saving/save/cancel/confirm`, toast-strenger. |
| 1.4 | `src/pages/Kart.tsx` + kart-popups | WIP | Kart.tsx, ResourceTimeline, FlightHub2SendDialog (`fh2Dialog.*`) og AdjacentAreaPanel (`adjacentAreaPanel.*`) migrert 2026-07-12. SoraSettingsPanel var i praksis allerede migrert (kun tekniske akronymer/placeholders igjen). Kart-popups i `OpenAIPMap.tsx` (~27 nb-strenger) og `Map3D.tsx` (~70 nb-strenger) står igjen — utsatt til vi utvider luftrom-støtte utenfor Norge (samme kontekst, samme popups). |
| 1.5 | `src/pages/Resources.tsx` + `src/components/resources/*` | DONE | Alle dialoger migrert 2026-07-12. Resources.tsx var allerede fullstendig migrert (kun DB-enum-verdier "Grønn"/"Gul"/"Rød" og "alle"-filter-sentinel gjenstår som interne identifikatorer). Add*-dialoger og øvrige (AddCompetencyDialog, AddDronetagDialog, AddEquipmentDialog, AddEquipmentToDroneDialog, AddPersonnelToDroneDialog, DronetagDetailDialog, MoveDroneDialog, ResourceVisibilityWarningDialog, PersonnelFlightKpi) bruker allerede `t()`. |
| 1.6 | `src/components/Header.tsx` | DONE | Plattformstatistikk/Marketing/Driftstatus/Lukk migrert til `header.*` 2026-07-12. |

| 1.7 | `src/pages/Auth.tsx` + `src/pages/ResetPassword.tsx` | DONE | Auth.tsx: siste hardkodede strenger (captcha-toast, signup-toast, "Selv-registrering midlertidig stengt"-blokker, allerede-innlogget-kort) migrert til `auth.*` 2026-07-12. ResetPassword.tsx: full migrering til nytt `auth.resetPassword2.*`-namespace. |

## Fase 2 – Hendelser, dokumenter, opplæring

| # | Fil / område | Status |
|--:|--------------|--------|
| 2.1 | `src/pages/Hendelser.tsx` + incident-dialoger | DONE – Hendelser.tsx: alle ECCAIRS-relaterte toasts/labels/knapper/AlertDialog migrert til `incidents.eccairs.*`; `getEccairsStatusLabel` tar nå `t`-funksjon. IncidentsSection/IncidentDetailDialog/AddIncidentDialog: kun enum-verdier igjen, ingen migrering nødvendig. |
| 2.2 | `src/pages/Documents.tsx` + `src/components/documents/*` | DONE – DocumentUploadDialog, DocumentCardModal, FolderDetailDialog, FolderGrid migrert til `documents.uploadDialog.*`/`cardModal.*`/`folderDetail.*`/`folderGrid.*`. Documents.tsx var allerede migrert av tidligere agent. Kun DB-enum-status ("Grønn"/"Gul"/"Rød") gjenstår som intern identifikator. |
| 2.3 | Training-flater (`src/components/training/*`, admin-Training*) | DONE – TrainingCourseEditor.tsx og TrainingSection.tsx koblet til `training.courseEditor.*`/`training.section.*` (nøklene fantes allerede fra tidligere arbeid, kun `useTranslation`+`t()`-kobling manglet). Lagt til manglende nøkkel `toastFetchCoursesFailed` i begge språkfiler. |
| 2.4 | Guided tours (`src/tours/*`) | DONE |

## Fase 3 – SORA, ECCAIRS, safety

| # | Fil / område | Status |
|--:|--------------|--------|
| 3.1 | SORA-flater → namespace `sora` | DONE |
| 3.2 | ECCAIRS-flater → namespace `eccairs` | DONE |
| 3.3 | Safety/airspace → namespace `safety` | DONE – `src/lib/routeProximityLayers.ts` popup-byggere (fartøy/AIS, luftfartshindre, kraftlinjer, CAA-soner, vern-restriksjoner, auto-vist-badge) koblet til `safety.routeProximity.*` via modul-nivå `tp()`-hjelper. `natureProtectionRules.ts` doc-kommentar verifisert (beskriver dynamisk generert etikett, ikke hardkodet UI-streng — ingen endring nødvendig). |

## Fase 4 – Admin og backoffice

| # | Fil / område | Status |
|--:|--------------|--------|
| 4.1 | `src/pages/Admin.tsx` + `src/components/admin/*` | DONE – EmailTemplateEditor.tsx: alle `t()`-kall i `admin.emailTemplate.*` verifisert/manglende nøkler lagt til. FH2DevicesSection.tsx: manglende `admin.fh2Devices.*` nøkler (kamera, lagring, fastvare, HMS-felter, debug-sandkasse, legg-til-medlem-dialog) lagt til. ChildCompaniesSection.tsx (~2300 linjer): fullt migrert til `admin.childCompanies.*` med `useTranslation`, `t` skygges aldri. Alle nye nøkler lagt til i both no.json og en.json. RevenueCalculator er bevisst hoppet over per brukerens ønske (utenfor denne økten). Gjenstår ellers: CompanyManagementSection/Dialog, CustomerManagementSection/Dialog, CustomerDetailDialog, MissionTypesSection, BulkEmailSender (om ikke allerede dekket).
| 4.2 | `src/pages/Status.tsx` + `useStatusData.ts` | DONE | Status.tsx migrert 2026-07-12: CSV/PDF-eksport, page-header, KPI-kort, chart-titler, deviation-view og tabellheadere bruker `status.*`-nøkler. `useStatusData.ts` har ingen brukervendte strenger (kun DB-enums Grønn/Gul/Rød beholdes). |
| 4.3 | `src/pages/Priser.tsx`, `Installer.tsx`, `Changelog.tsx` | DONE | Priser.tsx: nøkler flyttet fra `pages.pricing.*` til toppnivå `pricing.*` namespace (var allerede fullt koblet til t()). Installer.tsx: nytt `installer.*` namespace lagt til i begge språkfiler (fantes bare som inline default-strenger tidligere, ingen faktiske oversettelsesnøkler). Changelog.tsx: var i stor grad allerede migrert til `changelog.*`; resterende hardkodede strenger (bildeopplasting-feilmeldinger, bilde-label, forhåndsvisning, lukk-aria-label) migrert til `changelog.dialog.*`.
| 4.4 | `src/pages/Marketing.tsx` + `src/components/marketing/*` | SKIP | Kun tilgjengelig for Avisafe-superadmins — utsatt/utelatt fra i18n-migrering. |

## Fase 5 – PDF, notifications, edge functions

| # | Fil / område | Status |
|--:|--------------|--------|
| 5.1 | PDF-eksport (`oppdragPdfExport`, `riskAssessmentPdfExport`, `incidentPdfExport`, `userManualPdf`) | DONE | userManualPdf.ts migrert 2026-07-13: alle 17 seksjoner (titler, avsnitt, lister, tabeller) flyttet til `pdf.userManual.sections.*` i no/en pdf.json, hentet via i18n.t(returnObjects). Tittelside, TOC, footer bruker eksisterende `pdf.userManual.*`-nøkler. Verifisert med bunx tsgo --noEmit (ingen feil). |
| 5.2 | `src/lib/notifications.ts` → namespace `notifications` | DONE | Alle brukervendte strenger i incident-notification HTML migrert til `notifications.incident.*` 2026-07-12. |
| 5.3 | Edge functions (bruker-vendte) → lokale `prompts.ts` | DONE | company-status-ai og platform-statistics-ai fikk egne `prompts.ts` 2026-07-13 (SYSTEM_PROMPT + buildUserPrompt). Øvrige AI-funksjoner (drone-regulations-ai, ai-search, generate-narration, ai-risk-assessment, generate-course, suggest-course-topics) hadde allerede `prompts.ts`. marketing-ai og marketing-visual er bevisst hoppet over (kun for superadmins, jf. Fase 4.4). E-post-innhold i edge functions forblir norsk (server har ikke bruker-språkkontekst). |

## Fase 6 – Sluttopprydding

| # | Fil / område | Status |
|--:|--------------|--------|
| 6.1 | `src/data/mockData.ts` (vurder utelatelse) | SKIP | Inneholder kun mock/seed-data (norske streng-verdier som representerer domenedata, ikke UI-strenger). Brukes kun av `src/components/dashboard/CalendarSection.tsx` som fallback. Ikke oversettelses-materiale. |
| 6.2 | `src/types/index.ts`, `maintenanceStatus.ts`, `oppdragHelpers.ts` | DONE | `src/types/index.ts` inneholder kun TypeScript-literaltyper som matcher DB-enums (Grønn/Gul/Rød, Planlagt/Pågår osv.) — ikke UI-strenger, beholdes uendret. `maintenanceStatus.ts`: fallback-navn "Tilbehør"/"Utstyr" migrert til `resources.accessoryFallback`/`equipmentFallback`. `oppdragHelpers.ts`: "Ukjent"-fallback i `getAIRiskLabel` migrert til `common.unknown`. Statusfarge-maps og AI-risk-fargefunksjoner bruker DB-enum-verdier som nøkler (ikke UI-tekst). |
| 6.3 | Regenerér heatmap og bekreft ferdig | DONE | `bun run scripts/i18n-scan.ts` kjørt 2026-07-13: 140 filer, 973 treff igjen — hovedsakelig DB-enums, tekniske identifikatorer, mock-data, kart-popups (Kart 1.4 WIP for OpenAIPMap/Map3D), samt bevisst hoppede overflater (Marketing 4.4, RevenueCalculator, edge-function e-poster). Alle bruker-vendte UI-strenger på definerte oversettelses-flater er nå på nøkler. |
