# Fiks tre feil i AI-risikovurderingen

Ingen databaseendringer. Alt arbeid i `supabase/functions/ai-risk-assessment/` og `RiskAssessmentDialog.tsx`.

## 1) Dagens dato i AI-input
- Ny hjelpefil `dateContext.ts`: `osloDateString(d)`, `osloIsoWithOffset(d)`, `daysBetweenOslo(fromYmd, toDateLike)` (heltall, negativ = forfalt; kalenderdager i Europe/Oslo via `Intl.DateTimeFormat`).
- `contextData` (index.ts ~2290) får øverst `assessmentContext { currentDate, currentDateTime, missionDate, daysUntilMission }`.
- `assignedEquipment`, `assignedDrones` og `primaryDrone` får `daysUntilNextMaintenance` / `daysUntilNextInspection` der dato finnes (ellers null).
- `prompts.ts` (NO + EN, system- og SORA-revurderingsprompt): regel om at `assessmentContext.currentDate` er eneste «i dag», ikke utlede dato fra andre datoer, bruk `daysUntil*` ved omtale.
- `buildSoraReassessUserPrompt` får `currentDate`-parameter og tar det med i prompten.

## 2) SORA-revurdering og primærdrone
- I SORA-revurderingsgrenen, før anti-hallusinasjonsvakten (~1002): hent `missions.drone_id` + `mission_drones → drones(modell)` med samme RLS-klient som hovedvurderingen. Slå sammen med eventuelle `previousAnalysis.primaryDrone/assignedDrones` og `previousAnalysis.missionFacts`.
- `hasKnownDrone = knownDroneModels.length > 0`; da legges ingen «primærdrone ikke spesifisert»-merknad på og `scrub()` bytter ikke ut ekte modellnavn.
- Hovedvurderingen lagrer `aiAnalysis.missionFacts = { primaryDroneModel, assignedDroneModels, observerCount }`.
- `prompts.ts`: «hoveddrone» → «primærdrone» (NO), «primary drone» (EN).

## 3) Luftromsobservatør fra oppdragets personell
- index.ts ~1185: select utvides med `role_id, company_mission_roles(name)`; faller tilbake til separat oppslag i `company_mission_roles` hvis FK-join feiler.
- Ny ren funksjon `countMissionObservers(roles)` i egen fil: `total` (/observat|observer/i), `airspace` (/luftrom|airspace|\bVO\b/i), `ground` (/bakke|ground/i).
- Hard stop `requireObserver` (~3187): `observerCount = max(pilotInputs.observerCount, missionObserverCount)`.
- M1(C) i `calculateSora` (~2695): uendret, bruker kun `pilotInputs.observerCount`.
- `contextData.mission` får `personnelRoles: [{ identifier: 'Person N', role }]` (ingen navn) og `observers: { airspace, ground, total }`.
- `RiskAssessmentDialog.tsx`: henter oppdragets personell med rollenavn, forhåndsutfyller «Antall observatører» (kan endres), viser hint «Hentet fra oppdragets personell» (ny i18n-nøkkel i `no.json`/`en.json`).

## Validering
- `hardStops_test.ts`: pilotInputs.observerCount=0, missionObserverCount=1, requireObserver=true → ingen observer-hard-stop.
- Ny `dateContext_test.ts`: daysUntil rundt midnatt i Oslo (f.eks. 23:30 UTC = neste dag Oslo), inkl. sommertid.
- Test for `countMissionObservers`.
- Kjøre Deno-tester, `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`, deploye funksjonen.
- Ende-til-ende-kjøring på oppdrag med drone + luftromsobservatør + batteri med nær vedlikehold må gjøres av deg (ingen innlogget sesjon i sandkassen): forventet ingen «i dag»-feil, ingen «primærdrone ikke spesifisert», ingen observer-hard-stop, og M1(C) ikke kreditert.
- Oppsummere endrede filer.
