# Oversettelse av resten av appen (kun UI)

Scope: kun UI-tekster (etiketter, knapper, faner, badges, toasts, dialoger). AI-genererte tekster fra edge-funksjonen er allerede språkbevisste og rører vi ikke.

## Batch 1 — AI risikovurdering-resultatet

Hardkodet norsk rundt AI-svaret:

- `RiskAssessmentDialog.tsx` — faneetiketter (Input / Manuell SORA / History / Result), "Foreslått konklusjon", "OPPDRAGSOVERSIKT", "VURDERINGSMETODE", "Overall score", anbefalingsbåndet ("Fly with precautions" osv. — UI-label, ikke AI-tekst), "Lagre kommentarer", "Eksporter til PDF", "Kjør SORA-basert re-vurdering", "Kreves at alle manuelle felt er fylt inn", AI-disclaimer-boksen.
- `RiskScoreCard.tsx` — "Operasjonskategorisering (Steg 0)", "Specific — SORA", "SORA utført", "Systemberegnet".
- `AirRiskAnalysisSection.tsx` — "Luftrisikoanalyse (ARC/TMPR)" + statiske labels.
- `GroundRiskAnalysisSection.tsx` — "Bakkerisikoanalyse (iGRC/fGRC)", "Systemberegnet".
- `OperationClassificationSection.tsx` — klassifiserings-labels.
- `RiskRecommendations.tsx` — kun seksjonstittel "Forutsetninger for flyging" (selve anbefalingene kommer fra AI).

## Batch 2 — Dashboard-widgets rundt resultatet

- `MissionsSection.tsx` — gjenværende strenger: "Risiko"-fallback, "Sjekkliste"-badge, "Oppdrag"-fallback, AlertDialog ("Send til godkjenning?", "Avbryt", "Send til godkjenning"), toasts ("Gjennomfør SORA først", "Kunne ikke sjekke godkjennere", "Ingen i selskapet ...", "Kunne ikke sende til godkjenning").
- `IncidentsSection.tsx` — "Report incident", faneetiketter, "Incidents last 6 months", månedsforkortelser, alvorlighetsbadges, statusbadges, kategori-/årsak-badges.
- `DocumentSection.tsx` — "Documents"-overskrift, "Expired"-badge, dokumentkategori-labels.
- `CalendarSection.tsx` / `CalendarWidget.tsx` — ukedager, månedsnavn via `date-fns` locale, "Active flights", "Free flight", "View on map", "Upcoming missions".
- `ActiveFlightsSection.tsx` — "Start flight", "End flight", "Log flight time / Upload flight log".

## Batch 3 — DB-verdier som vises i UI

Verdier som "Planlagt/Pågående/Godkjent/Fullført/Avlyst", "Åpen/Under behandling/Lukket", "Lav/Middels/Høy", "Luft/Operativ", "Materiellsvikt/Menneskelig feil/svikt" og dokumentkategorier ("loggbok", "oppdrag", ...) er lagret som rene strenger i DB (og brukt i WHERE-filtre). Vi rører ikke databasen — i stedet:

- Utvider `src/lib/i18nHelpers.ts` med `translateMissionStatus`, `translateApprovalStatus`, `translateIncidentStatus`, `translateSeverity`, `translateIncidentCategory`, `translateRootCause`, `translateDocCategory`.
- Bruker dem ved visning. DB-verdien forblir norsk så filtre og eksisterende data fortsetter å virke.

## Batch 4 — Sekundære dialoger

`RiskAssessmentTypeDialog`, `NotamDialog`, `MissionDetailDialog`, `AddMissionDialog`, `AddIncidentDialog`, `NewsSection`, `StatusPanel`, "Internt søk (regelverkssøk)" (`AISearchBar`), resource status-kort.

## Batch 5 — Sider utenfor dashboardet

Egen runde per side: `Oppdrag`, `Hendelser`, `Resources`, `Documents`, `Kalender`, `Kart`, `Statistikk`, `SoraProcess`, `Marketing`, admin-komponenter.

## Arbeidsmetode per batch

1. Identifiser hardkodede strenger (også toast/alert/aria).
2. Legg nye nøkler under tydelig namespace i `no.json` + `en.json` (`risk.result.*`, `dashboard.incidents.*`, `enums.missionStatus.*`).
3. Erstatt med `t('...')`. DB-verdier oversettes kun ved visning.
4. Verifiser i preview ved språkbytte.

Si fra om rekkefølgen passer, eller om noe (f.eks. Hendelser eller Dokumenter) skal opp først, så starter jeg Batch 1.
