# Plan: Fortsette i18n-migrasjon til engelsk

Infrastrukturen er allerede på plass (`i18next`, `useTranslation`, `getFixedT`, `useTerminology`, scan-script, README med konvensjoner, `pdf`-namespace opprettet). Gjenstår: **191 filer, 1793 linjer** med hardkodet norsk. Vi tar dette i bølger – ikke i én stor PR.

## Prinsipper (fra `src/i18n/README.md`)

- Behold eksisterende nøkler urørt – aldri rename/flytt.
- `fallbackLng: 'no'` – uoversatte nøkler vises på norsk, aldri tomt.
- Bruk `useTranslation()` i React, `getFixedT(lang, ns)` utenfor React (PDF, edge functions).
- Bruk `useTerminology()` for drone/luftfartøy-terminologi.
- Nytt namespace **kun** når en modul har >~50 strenger eller lever utenfor React.
- Edge functions: lokale `prompts.no.ts`/`prompts.en.ts` per function – ingen frontend-import.

## Bølger

Hver bølge = én PR-størrelse, kan leveres uavhengig. Etter hver bølge kjøres `bun scripts/i18n-scan.ts` og preview QA-es på både `no` og `en`.

### Bølge 1 – Toppinnhold i `translation` (kjerne-UI)
Filer fra topp 20 i scan som hører hjemme i hovednamespacet:
- `src/pages/Status.tsx` (59)
- `src/components/resources/DroneDetailDialog.tsx` (54)
- `src/components/UploadDroneLogDialog.tsx` (53)
- `src/components/ProfileDialog.tsx` (47)
- `src/components/resources/EquipmentDetailDialog.tsx` (26)
- `src/components/resources/PersonCompetencyDialog.tsx` (25)

Nøkler legges under eksisterende toppnivå (`profile.*`, `resources.*`, `status.*`).

### Bølge 2 – Admin-modul (eget `admin`-namespace)
Admin har mye tekst som ikke deles med øvrig UI – kandidat for eget namespace.
- `src/components/admin/EmailTemplateEditor.tsx` (60)
- `src/components/admin/ChildCompaniesSection.tsx` (54)
- `src/components/admin/RevenueCalculator.tsx` (38)
- `src/components/admin/TrainingCourseEditor.tsx` (31)
- `src/components/admin/CompanySoraConfigSection.tsx` (30)
- `src/components/admin/CompanyManagementSection.tsx` (18)
- `src/pages/Admin.tsx` (20)
- `src/components/admin/TrainingSection.tsx` (13)
- Resterende admin-filer fra scan-rapporten

Oppretter `src/i18n/locales/{no,en}/admin.json` og registrerer i `src/i18n/index.ts`.

### Bølge 3 – Guided tours (eget `tours`-namespace)
Tours er selvstendig domene med 100+ strenger samlet.
- `src/tours/resourcesTour.ts` (39)
- `src/tours/adminTour.ts` (34)
- `src/tours/incidentReportTour.ts` (22)
- `src/tours/missionCreationTour.ts` (18)
- `src/tours/dashboardWidgetsTour.ts` (14)
- `src/tours/startFlightTour.ts` (10)
- + resterende tours

Tour-definisjoner kalles utenfor React → bruk `getFixedT('no'|'en', 'tours')`.

### Bølge 4 – Dashboard og oppdrag
- `src/components/dashboard/RiskAssessmentDialog.tsx` (44)
- `src/components/dashboard/AirspaceWarnings.tsx` (19)
- `src/components/dashboard/SoraAnalysisDialog.tsx` (18)
- `src/components/dashboard/AddMissionDialog.tsx` (13)
- `src/components/dashboard/IncidentDetailDialog.tsx` (12)
- `src/components/dashboard/MissionMapPreview.tsx` (9)
- `src/components/dashboard/DocumentDetailDialog.tsx` (14)
- `src/components/dashboard/DocumentSection.tsx` (13)
- `src/components/oppdrag/dialogs/OppdragDialogs.tsx` (8)
- `src/hooks/useOppdragData.ts` (9)

### Bølge 5 – Kart, vær, luftrom
- `src/lib/mapDataFetchers.ts` (43)
- `src/lib/mapWeatherPopup.ts` (11)
- `src/components/OpenAIPMap.tsx` (12)
- `src/components/DroneWeatherPanel.tsx` (17)
- `src/components/admin/MapPublicationDefaultsCard.tsx` (8)
- Andre `map*`-helpers fra scan

Vurder eget `map`-namespace hvis sum > 50 nøkler.

### Bølge 6 – SORA, ECCAIRS, incident
- `src/pages/SoraProcess.tsx` (18)
- `src/components/SoraSettingsPanel.tsx` (14)
- `src/config/eccairsFields.ts` (31)
- `src/lib/eccairsAutoMapping.ts` (19)
- `src/pages/Hendelser.tsx` (18)

`sora` og `eccairs` får egne namespaces (regulatorisk terminologi – jf. README).

### Bølge 7 – PDF/eksport (utvider eksisterende `pdf`-namespace)
- `src/lib/oppdragPdfExport.ts` (24)
- `src/lib/riskAssessmentPdfExport.ts` (10)
- `src/lib/userManualPdf.ts`
- `src/lib/icsExport.ts`, `src/lib/kmzExport.ts`, `src/lib/oppdragKmzExport.ts`
- `src/lib/flightTrackExport.ts`
- `src/lib/incidentPdfExport.ts`

Alle eksport-funksjoner aksepterer `language`-parameter med `getCurrentLanguage()` som default → `getFixedT(language, 'pdf')`.

### Bølge 8 – Marketing, training, dokumenter
- `src/components/marketing/*` (Settings 18, DraftEditor 13, m.fl.)
- `src/components/training/TakeCourseDialog.tsx` (17)
- `src/components/training/AICourseGeneratorDialog.tsx` (14)
- `src/components/documents/*` (DocumentCardModal 18, FilterBar 9, FolderDetailDialog 9)

### Bølge 9 – Resterende dialoger og sider
- `src/components/LogFlightTimeDialog.tsx` (16)
- `src/components/StartFlightDialog.tsx` (15)
- `src/components/FlightHub2SendDialog.tsx` (8)
- `src/components/FlightLogbookDialog.tsx` (8)
- `src/components/SubscriptionGate.tsx` (7)
- `src/pages/{Installer,Kalender,Resources,Changelog}.tsx`
- Alle filer ≤ ~10 treff som ikke er dekket

### Bølge 10 – Edge functions (AI-prompts)
For hver function med norsk tekst:
- Opprett `supabase/functions/<name>/prompts.ts` med `getPrompts(language)` etter mønsteret i `drone-regulations-ai/` og `suggest-course-topics/`.
- Frontend sender `language: getCurrentLanguage()` i alle `invoke()`-kall.
- Funksjoner som bør dekkes: `ai-search`, `ai-risk-assessment`, `ai-marketing-*`, `eccairs-*`, alle AI-edge-functions med norsk system-prompt.

### Bølge 11 – Falske positiver og opprydding
- `src/data/mockData.ts` (42), `src/types/index.ts` (10), `src/lib/i18nHelpers.ts` (17) – sannsynlig kommentarer/seed-data, vurderes manuelt.
- Endelig scan skal vise <50 treff (kommentarer/dokumentasjon).

## Teknisk

- **Verktøy:** `bun scripts/i18n-scan.ts` etter hver bølge for fremdriftsmåling.
- **Språkbytte:** allerede implementert via `Header.tsx` + `setLanguage()`. Ingen endring.
- **QA:** etter hver bølge – bytt språk i preview, klikk gjennom berørt UI på begge språk.
- **Aviation-terminologi:** alle nye nøkler som omtaler kjøretøy går via `useTerminology()`, ikke direkte `t('drone')`.
- **Ingen rename av eksisterende nøkler** – nye keys legges til, gamle står.
- **Ingen tomme placeholder JSON-filer** – nytt namespace opprettes først når bølgen som bruker det leveres.

## Leveranse-rekkefølge (anbefalt)

Bølge 1 → 2 → 3 → 4 → 7 (PDF tidlig, ofte etterspurt av engelske kunder) → 5 → 6 → 8 → 9 → 10 → 11.

Hver bølge er én selvstendig leveranse. Klar til å starte med **Bølge 1** etter godkjenning – eller velg en annen startbølge.
