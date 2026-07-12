# i18n-migrasjon: statussporing

Sist oppdatert: 2026-07-12

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
| 1.1 | `src/components/dashboard/*` (widgets) | WIP | DocumentDetailDialog, IncidentDetailDialog, AddMissionDialog (toasts), CalendarExportDialog, CalendarSubscriptionSection, FlightAnalysisTimeline, MissionMapPreview DONE 2026-07-12. Direct-visible widgets (DocumentSection, MissionsSection, IncidentsSection, StatusPanel, CalendarWidget, AISearchBar) og OperationClassificationSection allerede migrert. Gjenstår: RiskAssessmentDialog (JSX-tekst), ExpandedMapDialog, SoraAnalysisDialog/SoraResultView/MissionSoraRouteDocumentation (Fase 3 – SORA-namespace) |
| 1.2 | `src/pages/Oppdrag.tsx` + `src/components/oppdrag/*` | TODO | |
| 1.3 | `src/pages/Kalender.tsx` | TODO | |
| 1.4 | `src/pages/Kart.tsx` + kart-popups | TODO | Nytt namespace `map` |
| 1.5 | `src/pages/Resources.tsx` + `src/components/resources/*` | TODO | Mange dialoger |
| 1.6 | `src/components/Header.tsx` | TODO | Restopprydding |
| 1.7 | `src/pages/Auth.tsx` + `src/pages/ResetPassword.tsx` | TODO | |

## Fase 2 – Hendelser, dokumenter, opplæring

| # | Fil / område | Status |
|--:|--------------|--------|
| 2.1 | `src/pages/Hendelser.tsx` + incident-dialoger | TODO |
| 2.2 | `src/pages/Documents.tsx` + `src/components/documents/*` | TODO |
| 2.3 | Training-flater (`src/components/training/*`, admin-Training*) | TODO |
| 2.4 | Guided tours (`src/tours/*`) | TODO |

## Fase 3 – SORA, ECCAIRS, safety

| # | Fil / område | Status |
|--:|--------------|--------|
| 3.1 | SORA-flater → namespace `sora` | TODO |
| 3.2 | ECCAIRS-flater → namespace `eccairs` | TODO |
| 3.3 | Safety/airspace → namespace `safety` | TODO |

## Fase 4 – Admin og backoffice

| # | Fil / område | Status |
|--:|--------------|--------|
| 4.1 | `src/pages/Admin.tsx` + `src/components/admin/*` | TODO |
| 4.2 | `src/pages/Status.tsx` + `useStatusData.ts` | TODO |
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
