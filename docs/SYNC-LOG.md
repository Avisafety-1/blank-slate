# Sync-logg

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
