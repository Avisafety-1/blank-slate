# Sporbarhet: hvorfor «0 oppføringer i loggbøkene»

## Du har rett — tellingen måler feil ting

Verifisert i koden og databasen:

- Dronens loggbok bygges **direkte fra `flight_logs`** (rader med `drone_id` = dronen vises som «Flytur»-oppføringer). Det opprettes ingen egen rad i `drone_log_entries` for en flytur — den tabellen brukes bare til hendelser, vedlikehold, kvitteringer, advarsler og flyttinger.
- Pilotens loggbok bruker samme sannhetskilde: `flight_logs` koblet til piloten via `flight_log_personnel`. `personnel_log_entries` inneholder i dag 17 rader totalt (manuelle notater/kompetanse), hvorav bare 3 har `flight_log_id`.
- Dagens «Hva denne loggen har oppdatert» teller rader i `drone_log_entries` (på drone + dato) og `personnel_log_entries` (på `flight_log_id`). Begge tellingene treffer tabeller som normalt ikke får rader fra en flytur, derfor 0 — selv om loggen faktisk vises i begge loggbøkene.

Sporbarheten er altså bedre enn tallet antyder: koblingen er `flight_logs.drone_id` og `flight_log_personnel.flight_log_id → profile_id`. Men den ene svakheten er reell: i stikkprøven har 1 av 8 nyeste flylogger **ingen** rad i `flight_log_personnel`, og 285 av 1270 logger mangler `drone_id`. Da havner loggen ikke i noen loggbok.

## Endringer

Erstatt tellingen med faktisk sporbarhet i «Loggført på»-fanen:

1. **I dronens loggbok** — Ja/Nei basert på om `flight_logs.drone_id` er satt. Ved Nei: «Ikke i noen dronelogg — sett drone via Endre».
2. **I pilotens loggbok** — Ja/Nei basert på om det finnes en `flight_log_personnel`-rad. Ved Nei: «Ingen pilot koblet til flyturen — sett pilot via Endre».
3. **Flytid** — behold flytid fra denne loggen og dronens akkumulerte timer, og legg til pilotens akkumulerte timer.
4. **Ekstra oppføringer knyttet til loggen** — vis antall advarsler lagret i dronens loggbok (`drone_log_entries`, type «Advarsel», samme drone og dato) og antall `personnel_log_entries` med `flight_log_id`, tydelig merket som «advarsler/notater» og ikke som selve flyturen.
5. Vis logg-ID (kort form) slik at oppføringen kan spores tilbake i ettertid.

Rader med 0/Nei får en kort forklarende hjelpetekst i stedet for bare et tall.

## Teknisk

- `src/lib/flightAnalysisTrack.ts`: `loadFlightLogContext` — legg til `inDroneLogbook` (drone_id satt), `inPilotLogbook` (finnes `flight_log_personnel`-rad), pilotens `profiles.flyvetimer`; filtrer drone-tellingen på `entry_type = 'Advarsel'`.
- `src/components/dashboard/FlightSummaryPanel.tsx`: bygg om sporbarhetsboksen med Ja/Nei-status, hjelpetekster og logg-ID.
- Nye i18n-nøkler i `no.json` og `en.json`.

Ingen databaseendringer; ingen endring i hvordan flytid beregnes.
