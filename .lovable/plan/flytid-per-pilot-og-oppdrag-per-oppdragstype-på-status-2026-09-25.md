# Flytid per pilot og oppdrag per oppdragstype på /status

## Endringer på statussiden
- **Flytid per pilot**: ny ekspanderbar seksjon (lukket som standard) med tabell: pilot, antall flyturer og flytid (t/min) i valgt periode, sortert etter mest flytid, med totalsum nederst.
- **Oppdrag fløyet per oppdragstype**: nye KPI-kort, ett per oppdragstype selskapet har satt opp på admin-siden (inkl. arvede typer fra overordnet selskap). Kun oppdrag som faktisk er fløyet i perioden telles (samme regel som risikografen: oppdraget har minst én flylogg). Oppdrag uten type eller med type som ikke lenger finnes vises som «Annet/uten type». Hvert oppdrag telles én gang selv med flere flylogger.

## Eksport
- **PDF**: ny tabell «Flytid per pilot» og tabell/kort «Oppdrag fløyet per oppdragstype».
- **Excel**: to nye ark med samme innhold.
- **CSV**: to nye seksjoner med samme innhold (felles datagrunnlag som Excel).

## Regler
- Flytid per pilot bruker den felles regelen fra loggboka: flyturen teller for personer koblet som pilot/personell, eller for eieren hvis flyturen ikke har noen personkobling. Dermed stemmer tallene med loggboka.
- Periode følger valgt filter på siden.
- Ingen databaseendringer, ingen AI-innhold. Alle nye tekster på norsk og engelsk.

## Teknisk
- `Status.tsx`: hent flylogger i perioden (`id, user_id, mission_id, flight_duration_minutes`, paginert), `flight_log_personnel` i chunks, profilnavn; hent `missions.oppdragstype` for fløyne oppdrag og `company_mission_types` (med `propagate_mission_types`-arv).
- Utvid `src/lib/pilotFlightLogs.ts` med en ren aggregeringsfunksjon for mange logger samtidig.
- `StatusPdfData` får `flightTimeByPilot` og `flownMissionsByType`; oppdater `statusPdfExport.ts` og `statusTabularExport.ts`.
- Kontroll: `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`, prøve-PDF rendret og sjekket visuelt.
