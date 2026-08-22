# Loggføringsinfo og endring av drone/pilot på flylogg

## Mål
I flyanalysen skal det tydelig fremgå hvordan loggfilen er registrert — hvilken drone, hvilken pilot og hvilket oppdrag den er knyttet til — og det skal være mulig å flytte loggen til en annen drone og/eller pilot. Alle avledede data (akkumulert flytid, drone-loggbok, personell-loggbok) skal følge med flyttingen.

## Ny seksjon: "Loggført på"
Øverst i fanen "Loggdetaljer og identifikatorer" i flyanalysen kommer en egen boks:

- Drone (navn + modell)
- Pilot (navn)
- Oppdrag (navn, eller "Ikke knyttet til oppdrag")
- Loggkilde (DJI-synk, manuell opplasting osv.) og dato

Knapp "Endre" i boksen åpner en liten dialog der drone og pilot kan byttes. Kun brukere som allerede har lov til å slette flyloggen (admin/operativ leder, eller den som eide loggen) ser knappen. Oppdragskobling endres ikke i denne runden.

## Hva skjer når man endrer
Bekreftelsesdialog som lister konkret hva som blir flyttet, f.eks.:
"Flyloggen flyttes fra Drone A til Drone B. 0,4 flytimer trekkes fra Drone A og legges til Drone B. 1 loggbokoppføring flyttes. Piloten byttes fra Ola til Kari; flytid og loggbokoppføring flyttes tilsvarende."

Ved bekreftelse:

- **Bytte av drone:** flyloggens drone oppdateres, flytimene trekkes fra gammel drone og legges til ny, og loggbokoppføringene i dronens loggbok som ble laget av denne flyturen (advarsler på samme dato/forfatter) slettes hos gammel drone og opprettes på nytt hos ny drone med samme innhold.
- **Bytte av pilot:** koblingen mellom flylogg og pilot byttes, pilotens akkumulerte flytid beregnes automatisk på nytt for begge piloter, og personell-loggbokoppføringen knyttet til flyturen slettes hos gammel pilot og opprettes på nytt hos ny pilot.
- Utstyr og øvrige data på flyloggen røres ikke.

Etter lagring oppdateres flyanalysen, ressurskortene og loggbøkene automatisk.

## Teknisk

- Ny `src/lib/flightLogReassign.ts` med `reassignFlightLog(flightLogId, { droneId?, profileId? })` og en `previewFlightLogReassign()` som bygger tekstlisten til bekreftelsesdialogen. Speiler mønsteret i `src/lib/flightLogDeletion.ts`.
  - Drone: `UPDATE flight_logs.drone_id`; `drones.flyvetimer` justeres manuelt begge veier (DB har kun INSERT-trigger `trg_update_drone_hours`); `drone_log_entries` med `entry_type='Advarsel'` + samme `entry_date` + samme `user_id` flyttes (slett + insert på ny drone).
  - Pilot: slett/insert i `flight_log_personnel` (trigger `trg_flp_recompute_pilot` rekalkulerer pilottimer automatisk); `personnel_log_entries` med `flight_log_id` = loggen slettes og opprettes på nytt med ny `profile_id`.
  - Alt kjøres sekvensielt med feilhåndtering; ved feil vises toast og ingen delvis melding om suksess.
- `FLIGHT_ANALYSIS_COLUMNS` i `src/lib/flightAnalysisTrack.ts` utvides med `drone_id`, `mission_id`, `user_id`, og loaderen henter dronenavn/-modell, pilotnavn (via `flight_log_personnel` → `profiles`, fallback `user_id`) og oppdragsnavn inn i summary-objektet.
- `FlightSummaryPanel.tsx`: ny "Loggført på"-boks + `onReassign`-callback; `FlightAnalysisDialog.tsx` sender callback videre.
- Ny `src/components/dashboard/ReassignFlightLogDialog.tsx` med drone- og pilot-velger (samme datakilder som `UploadDroneLogDialog`, drone-personell prioritert i pilotlisten) og bekreftelsessteg.
- Ingen databasemigrasjon nødvendig.
- Alle nye strenger legges i `no.json` og `en.json`.
