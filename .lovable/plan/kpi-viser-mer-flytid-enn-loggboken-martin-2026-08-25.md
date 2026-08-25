# KPI viser mer flytid enn loggboken (Martin)

## Årsak (verifisert i databasen)

Martin har tre grupper flyturer:

- 36 flyturer koblet til ham via `flight_log_personnel` = **215 min = 3 t 35 min** → dette er nøyaktig det loggboken viser.
- 8 flyturer der `flight_logs.user_id` = Martin og det finnes **ingen** pilotkobling = **63 min** (alle DJI-importer fra mars/april/juni 2026).
- 31 flyturer som Martin eier, men der andre er registrert som pilot (telles ikke noe sted for ham — riktig).

KPI-kortet teller gruppe 1 + gruppe 2 = 215 + 63 = 278 min = **4 t 38 min**. Loggboken teller kun gruppe 1. Altså er ikke KPI-en «feil beregnet» — de to visningene bruker ulik regel for flyturer uten pilotkobling.

## Endring

Gjør de to visningene identiske ved å bruke samme regel begge steder: **koblede flyturer + egne flyturer uten pilotkobling**. De 8 DJI-importene er reelle flyturer Martin har fløyet/importert uten at pilot ble satt; de bør vises i loggboken, ikke skjules.

- Nytt felles hjelpeoppslag (f.eks. `src/lib/pilotFlightLogs.ts`) som returnerer flytur-ID-ene for en person: alle `flight_log_personnel.flight_log_id` for `profile_id`, pluss `flight_logs.id` der `user_id = personId` og det ikke finnes noen rad i `flight_log_personnel` for den flyturen. Deduplisert.
- `FlightLogbookDialog.tsx`: `fetchFlightLogs` bruker hjelperen i stedet for kun `flight_log_personnel`. Summering (logget vs. manuelt), sletting, PDF-eksport og listen ellers uendret.
- `PersonnelFlightKpi.tsx`: bruker samme hjelper (samme regel som i dag), bare via felles kode.
- Ingen databaseendringer, ingen nye i18n-nøkler.

## Resultat

Både loggbok og KPI vil vise 4 t 38 min for Martin, og de 8 «eierløse» flyturene blir synlige i loggboken hans.

## Alternativ (si fra hvis du heller vil ha denne)

Motsatt løsning: KPI dropper fallbacken og viser kun koblede flyturer (3 t 35 min). Da stemmer tallene også, men de 8 flyturene tilhører ingen pilot og forsvinner helt fra flytidsregnskapet.
