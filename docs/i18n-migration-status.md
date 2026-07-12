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
| 4.3 | `src/pages/Priser.tsx`, `Installer.tsx`, `Changelog.tsx` | TODO |
| 4.4 | `src/pages/Marketing.tsx` + `src/components/marketing/*` | TODO |

## Fase 5 – PDF, notifications, edge functions

| # | Fil / område | Status |
|--:|--------------|--------|
| 5.1 | PDF-eksport (`oppdragPdfExport`, `riskAssessmentPdfExport`, `incidentPdfExport`, `userManualPdf`) | TODO |
| 5.2 | `src/lib/notifications.ts` → namespace `notifications` | TODO |
| 5.3 | Edge functions (bruker-vendte) → lokale `prompts.ts` | TODO |

## Fase 6 – Sluttopprydding

| # | Fil / område | Status |
|--:|--------------|--------|
| 6.1 | `src/data/mockData.ts` (vurder utelatelse) | TODO |
| 6.2 | `src/types/index.ts`, `maintenanceStatus.ts`, `oppdragHelpers.ts` | TODO |
| 6.3 | Regenerér heatmap og bekreft ferdig | TODO |
