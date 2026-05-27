# Plan: 80% engelsk-dekning – kritisk brukerflyt først

Vi forlater den filtette bølge-for-bølge tilnærmingen og prioriterer etter **brukerverdi**. Mål: en engelsk bruker skal kunne logge inn, navigere, jobbe med oppdrag/hendelser/dokumenter/SORA, og motta kundevendt output (PDF, e-post, AI-svar) på engelsk. Små admin-paneler og sjeldne dialoger kan stå på norsk inntil videre (fallback `no` fanger dem opp).

## Fase 0 – Fullfør forrige batch (rydding)

Lukker det som ble påbegynt så vi ikke etterlater halvferdige filer:
- `src/components/oppdrag/dialogs/OppdragDialogs.tsx` – ferdigstille PDF-eksport-dialog, sjekkliste-kobling, risiko-prompt.
- `src/components/SoraSettingsPanel.tsx` – 14 strenger.
- `src/components/FlightLogbookDialog.tsx` – 8 strenger.

Leveres som én batch, så er bordet rent.

## Fase 1 – Kritisk brukerflyt (UI brukeren ser hver dag)

Rekkefølge etter hvor brukeren først møter appen:

1. **Auth-flyt** – `src/pages/Auth.tsx`, `src/pages/ResetPassword.tsx`, `src/components/PasswordRequirements.tsx`, `src/components/MfaChallengeDialog.tsx`, `src/components/PasskeyPromptDialog.tsx`, `SubscriptionGate.tsx`.
2. **Navigasjon/header** – `src/components/Header.tsx`, `CompanySwitcher.tsx`, `NavLink.tsx`, `PendingApprovalsBadge.tsx`, `OfflineBanner.tsx`, `ForceReloadBanner.tsx`, `IdleTimeoutWarning.tsx`.
3. **Dashboard** – alle filer under `src/components/dashboard/` (RiskAssessmentDialog, AirspaceWarnings, SoraAnalysisDialog, AddMissionDialog, IncidentDetailDialog, MissionMapPreview, DocumentDetailDialog, DocumentSection) + `src/pages/Index.tsx`.
4. **Oppdrag** – `src/pages/Oppdrag.tsx`, `src/components/oppdrag/*` (MissionCard, OppdragFilterBar, AirspaceConflictWarning, ChecklistBadges), `src/hooks/useOppdragData.ts`, `LogFlightTimeDialog.tsx`, `StartFlightDialog.tsx`, `UploadDroneLogDialog.tsx`.
5. **Hendelser** – `src/pages/Hendelser.tsx`, `DeviationReportDialog.tsx`, `IncidentDetailDialog` (om ikke dekket i dashboard).
6. **Dokumenter** – `src/pages/Documents.tsx`, alle `src/components/documents/*`.
7. **SORA / Risiko** – `src/pages/SoraProcess.tsx`, `SoraSettingsPanel.tsx` (hvis ikke gjort i fase 0), `RiskAssessmentDialog`, `lib/soraGeometry.ts`-meldinger som vises i UI.
8. **Brukerinnstillinger** – `ProfileDialog.tsx`, `TwoFactorSetup.tsx`, `PasskeySetup.tsx`, `SignatureDrawerDialog.tsx`.

Nøkler legges under eksisterende toppnivå (`auth.*`, `dashboard.*`, `missions.*`, `incidents.*`, `documents.*`, `sora.*`, `profile.*`). Ingen nye namespaces i denne fasen.

## Fase 2 – Kundevendt output

Dette ser kunden/mottakeren, ikke nødvendigvis brukeren:

1. **PDF-eksport** – `src/lib/oppdragPdfExport.ts`, `riskAssessmentPdfExport.ts`, `incidentPdfExport.ts`, `userManualPdf.ts`, `flightTrackExport.ts`. Mønster: `getFixedT(language, 'pdf')`. Utvider `src/i18n/locales/{no,en}/pdf.json`.
2. **E-post** – `src/lib/notifications.ts` + alle edge functions som sender e-post (`send-notification-email`, `send-incident-email`, etc.). Mal-tekster lokaliseres via `language`-param fra frontend.
3. **AI-svar / prompts** – per edge function: `supabase/functions/<name>/prompts.ts` med `getPrompts(language)`. Prioritet: `ai-risk-assessment`, `ai-search`, `ai-marketing-*`, `eccairs-*`.
4. **Eksport/print** – `icsExport.ts`, `kmzExport.ts`, `oppdragKmzExport.ts`.
5. **Offentlige kart-popups** – `lib/mapWeatherPopup.ts`, `mapTrafficPopup.ts`, `mapDataFetchers.ts`.

## Fase 3 – Systemmeldinger

På tvers av alle filer i fase 1+2, men løftes eksplisitt så vi ikke glemmer noe:

- **Toast-meldinger** – grep etter `toast.success(`, `toast.error(`, `toast(` i alle berørte filer.
- **Valideringsmeldinger** – Zod-skjemaer, `setError`, inline form-feil.
- **Statusbadges** – `StatusBadge.tsx` + alle steder som leser `status`-felt. Bruker eksisterende `translateMissionStatus`, `translateApprovalStatus`, `translateIncidentStatus`, `translateSeverity` i `lib/i18nHelpers.ts` – sikre at de er brukt overalt der status vises.
- **Globale feilmeldinger** – `ErrorBoundary.tsx`, `NotFound.tsx`, Sentry fallbacks.

## Hva vi bevisst utsetter

- Admin-modul (EmailTemplateEditor, RevenueCalculator, ChildCompaniesSection, etc.) – Lite brukt av sluttbruker.
- Guided tours – Frivillig onboarding, lav prioritet.
- Marketing-modul – Internt verktøy for Avisafe-superadmins.
- Training/kursinnhold.
- Changelog (allerede gjort i forrige runde) og MapPublicationDefaultsCard (gjort).

Disse kan tas senere som en "fase 4 – komplett dekning".

## Leveranseform

Hver fase deles i 2–4 batcher (avhengig av credits). Etter hver batch:
- `bun scripts/i18n-scan.ts` for fremdriftsmåling.
- Manuell QA: bytt språk i Header, klikk gjennom den nylig oversatte flyten.

Anbefalt rekkefølge: **Fase 0 → Fase 1 (auth+nav+dashboard) → Fase 2 (PDF+e-post+AI) → Fase 1 resten → Fase 3 opprydding**. Da har en engelsk kunde "en fungerende app" og "engelske rapporter/e-poster" tidlig, før vi finpusser resten.

## Teknisk

- Fortsatt `fallbackLng: 'no'` – uoversatte strenger vises på norsk, aldri tomt.
- Ingen rename av eksisterende nøkler.
- Edge functions bruker lokale `prompts.{no,en}.ts` – ingen frontend-import.
- `useTerminology()` brukes der drone/luftfartøy-terminologi forekommer.
- `translate*`-helpers i `lib/i18nHelpers.ts` utvides ved behov, ikke duplisert i komponenter.

Klar til å starte med **Fase 0** etter godkjenning.
