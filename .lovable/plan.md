# Flytid siste X dager viser 0 for Natan

## Årsak (verifisert i databasen)

KPI-kortet «Flytid – siste 30/90/180 dager» og loggboken bruker to forskjellige koblinger mellom flytur og pilot:

- **Loggboken** (`FlightLogbookDialog`) henter flyturene via `flight_log_personnel` (piloten som er tilknyttet flyturen). Natan har flere slike flyturer 20.08.2026, totalt 33 min.
- **KPI-kortet** (`PersonnelFlightKpi`) spør `flight_logs` med `user_id = personId`.

I Elverum-loggene er `flight_logs.user_id` for alle turene satt til **Dronepilot ELVIS** (brukeren som importerte DJI-loggene), mens den faktiske piloten kun ligger i `flight_log_personnel`. Derfor gir KPI-spørringen 0 treff for Natan, selv om loggboken viser 33 min.

## Endring

Gjør KPI-kortet til å bruke samme sannhetskilde som loggboken:

- Hent flytur-ID-ene fra `flight_log_personnel` for personen, og hent så `flight_date` + `flight_duration_minutes` fra `flight_logs` for disse ID-ene (med dato-cutoff som i dag).
- Ta også med flyturer der `flight_logs.user_id = personId` men det ikke finnes noen personell-rad, slik at eldre/manuelle logger uten pilotkobling ikke forsvinner. Dedupliser på flytur-ID.
- Ingen endring i beregning, perioder, currency-regler eller visning.

## Teknisk

- `src/components/resources/PersonnelFlightKpi.tsx`: bygg om `fetchLogs` til to spørringer (personell-kobling + fallback på `user_id`), slå sammen og dedupliser på `id` før `setLogs`.
- Ingen databaseendringer, ingen nye i18n-nøkler.

## Merk

Dette retter visningen. At `flight_logs.user_id` peker på importbrukeren og ikke piloten er en egen sak — den kan tas senere hvis dere vil at «eier» av loggen skal være piloten.
