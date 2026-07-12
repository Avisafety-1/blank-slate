# Sync-logg

## 2026-07-12 — i18n Fase 1.1: RiskAssessmentDialog (manuell SORA-fane)

**Migrert:** `src/components/dashboard/RiskAssessmentDialog.tsx` – hele "Manuell SORA"-fanen: oppdragsvelger, kontekstkort (Oppdrag/Dato/Sted/Risk-nivå), alle 5 accordion-seksjoner (Operasjonsmiljø, GRC, ARC, SAIL, Status), Select-alternativer (Tettbygd/Landlig/…, Lav/Moderat/Høy, Ikke startet/Under arbeid/…), textarea-plassholdere, «Utført/Godkjent av» og handlingsknappene (Avbryt/Lagre/Lagrer…). Nye nøkler under `riskAssessment.manualSora.*` i `no.json`+`en.json`. Ingen eksisterende nøkler flyttet. `tsgo --noEmit` OK.

Med dette er Fase 1.1 (dashboard-widgets) komplett bortsett fra Sora-flatene (SoraAnalysisDialog/SoraResultView/MissionSoraRouteDocumentation) som ligger under Fase 3 (SORA-namespace).



## 2026-07-12 — i18n Fase 1.1: ExpandedMapDialog

**Migrert:** `src/components/dashboard/ExpandedMapDialog.tsx` – dialog-tittel, SORA lagre-knapp + toasts, kart-satellittveksler, ruta/flyspor-popups (reuses `dashboard.missionMapPreview.*`), start/slutt-markører, legende og statistikk-tekst (Maks høyde/hastighet/AGL, Snitt AGL). Fetch-hjelperen `fetchZones` tar nå `t` som parameter for NSM/CTR-navn-fallbacks. Nye nøkler under `dashboard.expandedMap.*`. Bruker `dangerouslySetInnerHTML` for statistikk-strenger med `<strong>`-interpolasjon (i18next `escapeValue:false`). `tsgo --noEmit` OK.



## 2026-07-12 — i18n Fase 1.1: FlightAnalysisTimeline + MissionMapPreview

**Migrert:**
- `src/components/dashboard/FlightAnalysisTimeline.tsx` – tab-etiketter, InfoCell-labels, recharts `name`-props, seksjonstitler, StickWidget-labels, batterisammendrag, "Ingen hendelser registrert" og lokalisert tid → `dashboard.flightAnalysis.*`.
- `src/components/dashboard/MissionMapPreview.tsx` – Leaflet-popups (oppdragsmarkør, flytrack-detaljer, NSM/RPAS/CTR/AIP-soner, ATZ-flyplass), start/slutt-markører, tidsformatering → `dashboard.missionMapPreview.*` med interpolasjon.

Nye nøkler under `dashboard.flightAnalysis` og `dashboard.missionMapPreview` i `no.json`+`en.json`. Ingen eksisterende nøkler flyttet. `tsgo --noEmit` OK.



## 2026-07-12 — i18n Fase 1.1: kalender-eksport og abonnement

**Migrert:**
- `src/components/dashboard/CalendarExportDialog.tsx` – alle JSX-strenger, select-alternativer, toasts og genererte event-titler/typer → `dashboard.calendarExport.*` (med interpolasjon `{{model}}`, `{{name}}`, `{{value}}`, `{{count}}`).
- `src/components/dashboard/CalendarSubscriptionSection.tsx` – hele UI-en inkl. AlertDialog-tekst, verktøytips, e-postresultat, "Slik legger du til"-liste og lokalisert `toLocaleString` → `dashboard.calendarSubscription.*`.

Nye nøkler under `dashboard.calendarExport` og `dashboard.calendarSubscription` i `no.json`+`en.json`. Ingen eksisterende nøkler flyttet. `tsgo --noEmit` OK.



## 2026-07-12 — i18n Fase 1.1: dashboard-dialoger

**Migrert:**
- `src/components/dashboard/DocumentDetailDialog.tsx` – 6 toasts + 8 JSX-strenger (utløp, åpne, sist endret) → `dashboard.documents.*`.
- `src/components/dashboard/IncidentDetailDialog.tsx` – 1 toast + 8 JSX-strenger (oppfølgingsansvarlig, hovedårsak, kommentarer, alvorlighetsgrad) → `dashboard.incidents.*`.
- `src/components/dashboard/AddMissionDialog.tsx` – 2 geocode-toasts → `dashboard.missions.*`.

Nye nøkler lagt til under `dashboard.documents/incidents/missions` i `no.json`+`en.json`. Ingen eksisterende nøkler flyttet eller omdøpt. `tsgo --noEmit` OK.

## 2026-07-12 — i18n-migrasjon: plan + oppstart Fase 1


**Ny plan:** `.lovable/plan.md` – prioritert rekkefølge for full NO→EN-konvertering.
**Ny statusfil:** `docs/i18n-migration-status.md` – sjekkliste per fase/fil.
**Konvensjon lagt til:** `src/i18n/README.md` – seksjon "Length-sensitive strings"
med `Short`/`Abbr`-mønster for engelske strenger som ellers ville sprengt knapper.

**Fase 1.1 startet:** `src/pages/Index.tsx`
- Migrert hardkodede toasts (`checkout-success/cancelled`, `prepareEnd/end flight`-feil, tour-course-fullført/feil) til nye nøkler under `dashboard.*` og `flight.*` i `no.json` og `en.json`.

**Verifisering:** `tsgo --noEmit` OK.



## 2026-07-09 — iOS safe-area-fiks for mobilmeny

**Komponent:** `src/components/Header.tsx`  
**Problem:** På iPhone startet mobilmenyen (hamburger-panelet) helt øverst på skjermen, slik at lukke-krysset (×) havnet bak/under statuslinjen (klokke, batteri, notch). Android/Samsung var upåvirket.

**Endringer:**
- Fjernet fast `pt-10` på `SheetPrimitive.Content`.
- La til `style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2.5rem)' }}` for å skyve hele menyen ned under statuslinjen på iPhone.
- Endret `SheetPrimitive.Close` fra fast `top-4` til `style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}` slik at krysset følger samme forskyvning.

**Verifisering:**
- `tsgo --noEmit` kjørt uten feil.
- Mobil-preview (iPhone-viewport) bekrefter at meny og lukke-kryss ligger under statuslinjen.
- Android/Samsung-viewport bekrefter uendret utseende.


## 2026-07-12 — i18n Fase 1.2: Oppdrag-side (delvis)

**Komponenter:** `src/pages/Oppdrag.tsx`, `src/components/oppdrag/OppdragFilterBar.tsx`, `src/components/oppdrag/MissionCard.tsx`

**Endringer:**
- Migrert alle bruker-vendte strenger i Oppdrag-siden, filterlinjen og oppdragskortet til `pages.missions.*`-nøkler i `no.json` og `en.json` (nye under-namespace: `filterBar`, `card`).
- Interpolasjon brukes for tellere (`linkedIncidentsHeader`, `flightsHeader`) og godkjenner-navn (`approverCommentFrom`).
- Eksisterende oversettelser (`pages.missions.title`, `common.loading`) gjenbrukt uten duplisering.
- DB-statusstrenger som `"Fullført"`/`"Avbrutt"` bevart som råtekst (matches mot `mission.status`).

**Gjenstår i 1.2:** `src/components/oppdrag/dialogs/*`, `AirspaceConflictWarning.tsx`, `ChecklistBadges.tsx`.

**Verifisering:** `tsgo --noEmit` OK.
