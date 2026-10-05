# Fase 4a: Riktig datagrunnlag i AI-risikovurderingen

Ingen databaseendringer. Tallreglene fra fase 1–3 (iGRC/SAIL, decideApproval, systemDecisions, consistency) endres ikke.

## 1) VLOS/BVLOS, høyde og operasjonstype fra oppdraget
**Dialog (RiskAssessmentDialog.tsx)**
- Ved lasting av oppdrag: `isVlos = notam_operation_type !== 'BVLOS'` og `flightHeight = round(notam_max_agl_ft * 0.3048)` når feltene finnes.
- Hint «Hentet fra oppdraget/NOTAM» under feltene; gul merknad når brukerens verdi avviker fra oppdragets.
- `operationType` utledes fra oppdragets oppdragstype mot listen; ingen gyldig match → `'other'` (fjerner ugyldig standard `'inspection'`).
- Nye i18n-nøkler i no.json/en.json.

**Server (index.ts)**
- Ny ren hjelper `resolveFlightHeight(pilotInputs, mission)` → `{ heightM, source: 'pilot'|'notam'|'default', note }`. Mangler/ugyldig → NOTAM-høyde, ellers 120 m med merknad «Flyhøyde ikke oppgitt — 120 m lagt til grunn» i `mission_complexity`.
- Erstatter alle `Number(pilotInputs?.flightHeight ?? 0)` (CTR-tekst ~2239, AEC ~2466, hard stop maks høyde ~2605).
- `resolveIsVlos`: mangler `pilotInputs.isVlos` → fra `notam_operation_type`. Brukes alle steder som i dag leser `pilotInputs?.isVlos`.

## 2) Vedlikeholdsstatus lik appen
- `maintenanceStatus.ts` (edge): `calculateDroneAggregatedStatus` får `dbStatus` (drones.status) inn i `ownStatus`, med årsak «Dronestatus satt til Rød/Gul».
- Koblet utstyr: `equipment.status` legges til i select (~2110) og tas med i linked-statusen.
- Feilet oppslag → status `'Ukjent'` (behandles som gul i prioritet) med teksten «Vedlikeholdsstatus kunne ikke hentes»; aldri Grønn. Hard stop-logikken uendret (Ukjent gir ikke hard stop, men vises).
- Kommentar øverst i begge filer om at de må holdes like.
- Paritetstest `maintenanceParity_test.ts` som importerer begge filer og sammenligner ≥ 6 tilfeller (dato forfalt, nær forfall, timer, oppdrag, drones.status Rød, koblet utstyr Rød). Avklares under bygging om app-filen kan importeres fra Deno; ellers testes den rene logikken via felles fixtures mot begge.

## 3) Tidssone Europe/Oslo
- `calculateMaintenanceStatus`: dagens dato via `osloDateString(new Date())` og dagdifferanse via `daysUntilOslo`.
- Sivil skumring: beregnes for oppdragsdatoen i Oslo; både `tidspunkt` og `slutt_tidspunkt` (hvis satt) må ligge innenfor dawn–dusk. Logikken flyttes til ren `twilight.ts` med tester.
- Polarnatt når selskapet krever skumring → brudd med teksten «Ingen sivil skumring på denne datoen (polarnatt)». (Midnattssol behandles fortsatt som OK.)
- NOAA Kp: `missionDateStr`/morgendagen beregnes med Oslo-dato.

## 4) Små datafeil
- `drone_models`-oppslaget: fjern `, ( ) %` fra modellnavnet før `.or(...)`, eller bruk to separate `.ilike`-spørringer; feil logges.
- Fastvinge (~104): katalogens `category` først, deretter `/\b(fixed[- ]?wing|vtol|wing|fastvinge)\b/i`.
- Koblede dokumenttitler (~1946) leses med `callerClient` (RLS).

## Validering
- Nye tester: høyde mangler → 120 m + merknad; drones.status 'Rød' → ownStatus Rød; statusoppslag feiler → 'Ukjent'; slutt_tidspunkt etter dusk → brudd; polarnatt → brudd; modellnavn med parentes gir gyldig filter.
- `deno test supabase/functions/ai-risk-assessment/`, `deno check .../index.ts`, app-typesjekk.
- Deploy `ai-risk-assessment`; oppsummer endrede filer.

## Tekniske detaljer
Nye rene moduler: `flightInputs.ts` (høyde/VLOS), `twilight.ts`, `maintenanceParity_test.ts`. Endres: `index.ts`, `maintenanceStatus.ts`, `src/lib/maintenanceStatus.ts` (kun kommentar), `RiskAssessmentDialog.tsx`, `no.json`, `en.json`.
