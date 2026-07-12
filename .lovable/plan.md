
# Plan: Full i18n-konvertering (NO → EN)

## Bakgrunn (hva som allerede finnes)

- **Infrastruktur klar:** `src/i18n/index.ts` (i18next + LanguageDetector), `src/lib/i18nHelpers.ts` (`getCurrentLanguage`, `setLanguage`, `getFixedT`), `useTerminology()` for drone/fly, README med konvensjoner.
- **Namespaces i bruk:** `translation` (no.json/en.json, ~1528 linjer hver) og `pdf` (no/pdf.json, en/pdf.json).
- **Toppnivå-nøkler allerede definert:** `nav, actions, common, auth, flight, dronetag, header, dashboard, resources, missions, incidents, profile, status, forms, errors, roles, admin, riskAssessment, riskAssessmentType, terminology, dronelog, twoFactor, passkey, pages, changelog, mapPublication, oppdragDialogs, soraPanel, logbook`.
- **Edge functions:** eget mønster med lokale `prompts.ts` (`ai-search`, `generate-narration`, `suggest-course-topics`) – **ikke** i frontend-bundle.
- **Referansedokumenter:**
  - `src/i18n/README.md` – konvensjoner (les før hver PR).
  - `i18n-scan-report.md` – heatmap over 191 filer med hardkodet norsk (generert 2026-05-27, **skal regenereres** via `scripts/i18n-scan.ts` før vi starter).

Ingen egen migrasjonsplan-md finnes fra før – denne planen blir startdokumentet.

## Strategi

1. **Én modul per PR.** Aldri kombinere. Følger README pkt. "Inkrementell migrasjon".
2. **Legg nye nøkler under eksisterende toppnivå** når mulig. Nytt namespace **kun** når kriteriene i README treffer (PDF/AI/map/sora/safety – flere av disse er allerede store nok).
3. **Ingen omdøping / flytting av eksisterende nøkler.**
4. **`useTerminology()`** brukes for drone/fly – aldri hardkod "drone"/"aircraft" i nye nøkler.
5. **Regulatoriske forkortelser** (SORA, ECCAIRS, NSM, RPAS, NOTAM, CTR/TIZ) beholdes på begge språk.
6. **Verifikasjon per modul:** bytt UI til EN i preview, gå gjennom skjermbildet, sjekk at ingen nøkler vises som råtekst (`saveMissing`-warnings i devkonsoll).

## Håndtering av lange engelske strenger

Problemet: EN-oversettelser sprenger knapper/badges/tabellheadere.

Regelverk (legges til i README under en ny seksjon "Length-sensitive strings"):

- **Kort-plass-kontekst (knapper, tabs, badges, kolonneheadere, ikonlabels ≤ ~14 tegn NO):**
  - Bruk **to nøkler** når EN blir mer enn ~30% lengre enn NO:
    - `foo.action` – full form (brukes i menyer, dialoger, tooltips).
    - `foo.actionShort` – forkortet variant (brukes i knapper/tabs/badges).
  - Konvensjon: suffiks `Short` for forkortet, `Abbr` for standard bransjeforkortelser (f.eks. `flightHoursAbbr: "FH"`).
- **Tooltip-fallback:** komponenter som viser `Short`/`Abbr` skal ha `title`/`aria-label` med full form for tilgjengelighet.
- **Godkjente engelske forkortelser (foreslått – bekreftes underveis):**
  - Risk Assessment → "Risk Assmt." (kort), full i dialoger.
  - Maintenance → "Maint." i tabellheadere.
  - Equipment → "Equip." i badges.
  - Personnel → "People" i tabs.
  - Documents → "Docs" i sidebar/tabs.
  - Flight Hours → "FH".
  - Last inspection / Next inspection → "Last insp." / "Next insp." i tabeller.
  - Registration → "Reg." i tabellheadere.
  - Add / Delete / Edit → allerede korte, ingen `Short`-variant nødvendig.
- **Ingen CSS-hack** (`truncate`/`text-xs`) som primær fiks – teksten skal passe på engelsk uten å kutte visuelt.

## Prioritert rekkefølge

Prioritet basert på:
(a) **brukshyppighet** (hvor mange brukere ser siden daglig),
(b) **hvor bruker-vendt** teksten er (UI > interne tools/admin),
(c) **treff i scan-rapporten**.

### Fase 1 – Kjerne-navigasjon og daglige flater (høy prio)

Alle brukere ser disse hver dag; her ligger også de fleste knappene som blir lange på EN.

1. `src/pages/Index.tsx` (Dashboard) + `src/components/dashboard/*` – widgets, kort, badges.
2. `src/pages/Oppdrag.tsx` + `src/components/oppdrag/*` (`MissionCard`, `OppdragFilterBar`, `AirspaceConflictWarning`, `dialogs/OppdragDialogs.tsx`).
3. `src/pages/Kalender.tsx`.
4. `src/pages/Kart.tsx` + `src/lib/mapDataFetchers.ts`, `mapWeatherPopup.ts`, `zonePopups.ts` (kart-popups → **eget `map`-namespace**, som README foreslår).
5. `src/pages/Resources.tsx` + `src/components/resources/*` (DroneDetailDialog, EquipmentDetailDialog, PersonCompetencyDialog, AddDroneDialog, AddEquipmentDialog, ChecklistExecutionDialog).
6. `src/components/Header.tsx` (mobilmenyen – noen strenger igjen).
7. `src/pages/Auth.tsx` + `src/pages/ResetPassword.tsx`.

### Fase 2 – Hendelser, dokumenter, opplæring (medium prio)

8. `src/pages/Hendelser.tsx` + `src/components/dashboard/AddIncidentDialog.tsx`, `IncidentDetailDialog.tsx`, `DeviationReportDialog.tsx`.
9. `src/pages/Documents.tsx` + `src/components/documents/*`.
10. Training-flatene: `src/components/training/*`, `src/components/admin/TrainingCourseEditor.tsx`, `TrainingSection.tsx`, `TrainingStatusView.tsx`, `src/pages/UserManualDownload.tsx`.
11. Guided tours: `src/tours/*` – **eget `tours`-namespace** (over 200 strenger totalt).

### Fase 3 – SORA, ECCAIRS, safety (domene)

12. **Eget `sora`-namespace:** `src/pages/SoraProcess.tsx`, `SoraSettingsPanel.tsx`, `dashboard/SoraAnalysisDialog.tsx`, `SoraResultView.tsx`, `MissionSoraRouteDocumentation.tsx`, `admin/CompanySoraConfigSection.tsx`, `lib/soraGeometry.ts`/`soraBufferCalculator.ts` (kun bruker-vendt tekst).
13. **Eget `eccairs`-namespace:** `src/components/eccairs/*`, `src/config/eccairsFields.ts`, `src/lib/eccairsAutoMapping.ts`.
14. **Eget `safety`-namespace:** `AirspaceWarnings.tsx`, `AirspaceConflictWarning.tsx`, `AdjacentAreaPanel.tsx`, `natureProtectionRules.ts` (bruker-vendt).

### Fase 4 – Admin og backoffice (lavere prio, men mye tekst)

15. `src/pages/Admin.tsx` + `src/components/admin/*` (EmailTemplateEditor, ChildCompaniesSection, RevenueCalculator, CompanyManagementSection, CustomerDetailDialog, LiveStreamDialog, MapPublicationDefaultsCard, NotamRssFeedsSection, FH2*, BulkEmailSender, DeviationCategoryTreeEditor).
16. `src/pages/Status.tsx` + `src/hooks/useStatusData.ts`.
17. `src/pages/Priser.tsx`, `src/pages/Installer.tsx`, `src/pages/Changelog.tsx`.
18. `src/pages/Marketing.tsx` + `src/components/marketing/*`.

### Fase 5 – PDF, notifications, edge functions

19. **PDF-namespacet er allerede opprettet** men lite fylt. Migrer:
    - `src/lib/oppdragPdfExport.ts`, `riskAssessmentPdfExport.ts`, `incidentPdfExport.ts`, `userManualPdf.ts`. Alle skal ta `language`-parameter (default `getCurrentLanguage()`), bruke `getFixedT(language, 'pdf')`.
20. **Notifications:** `src/lib/notifications.ts` → eget `notifications`-namespace.
21. **Edge functions:** for hver bruker-vendt function (feilmeldinger, e-post, AI-svar), opprett lokal `prompts.ts` etter mønsteret i `ai-search`. Frontend sender `language` i `invoke()`-body. Prioritert liste bestemmes når fase 1-4 er ferdig.

### Fase 6 – Sluttopprydding

22. `src/data/mockData.ts` – vurder om mock brukes i UI; ellers utelates.
23. `src/types/index.ts`, `src/lib/maintenanceStatus.ts`, `src/lib/oppdragHelpers.ts` – enum-labels og statusnavn.
24. Regenerér `i18n-scan-report.md` og verifisér at kun regulatoriske forkortelser / kommentarer gjenstår.

## Leveranser per fase

For hver fase (PR-batch):
1. Legg nye nøkler i riktig namespace (opprett `src/i18n/locales/<lang>/<ns>.json` + registrer i `src/i18n/index.ts` når nødvendig).
2. Bytt strenger til `t(...)`. Bruk `Short`/`Abbr`-varianter der plassen krever det (se regelverk over).
3. Manuell verifikasjon i preview (NO + EN) på berørte skjermer.
4. `tsgo --noEmit`.
5. Kort oppføring i `docs/SYNC-LOG.md`.

## Sporing

Opprett `docs/i18n-migration-status.md` med sjekkliste-tabell (Fase → Fil → Status: TODO / IN PROGRESS / DONE / EN-verified). Denne oppdateres av hver PR og erstatter behovet for å hele tiden regenerere heatmap-rapporten.

## Ut av scope for denne planen

- Å faktisk skrive alle oversettelsene i én operasjon – planen definerer rekkefølgen, faktisk migrasjon skjer per fase på din bestilling.
- Backend-oversettelser i tabeller (f.eks. dynamiske roller, mission types) – disse forblir på det språket brukeren la dem inn.
- Nye språk utover EN (norsk bokmål + engelsk).

## Teknisk vedlegg

- Nye namespaces som skal opprettes underveis: `map`, `sora`, `eccairs`, `safety`, `tours`, `notifications`. Registreres i `src/i18n/index.ts` `resources` og `ns`-array i den fasen de introduseres.
- Regenerering av heatmap: `bun run scripts/i18n-scan.ts` (kjøres manuelt før hver fase starter for oppdatert prioritering).
- Konvensjon `Short`/`Abbr`-nøkler: dokumenteres i `src/i18n/README.md` sammen med tabell over godkjente engelske forkortelser (revideres per fase 1 når vi ser faktisk overflow i preview).

## Foreslått første steg etter godkjenning

Regenerér `i18n-scan-report.md`, opprett `docs/i18n-migration-status.md`, oppdatér README med `Short`/`Abbr`-seksjon, og start på **Fase 1, punkt 1 (Dashboard)**.
