# Loggfiler-fane på /oppdrag

Ny fane «Loggfiler» ved siden av «Oppdrag», med samme knappe-/bakgrunnsstil som fanene på /hendelser. Fanen viser alle flylogger i selskapet som et rutenett av små kort. Klikk på et kort åpner den eksisterende flylogganalysen.

## Hva bygges

**Faneknapper (topp av /oppdrag)**
- To knapper: «Oppdrag» (aktiv som i dag) og «Loggfiler», med samme glass-/border-stil som Hendelser/Avvik.
- Fanevalg speiles i URL (`?tab=logs`) så man kan dele/lenke direkte.

**Filtrering og søk**
- Toggle «Kun mine» (der jeg er pilot) — påslått som standard.
- Fritekstsøk (dronenavn/modell, serienummer, oppdragsnavn, sted, dato).
- Nedtrekk: drone, pilot, kilde (DJI / ArduPilot / manuell), samt datoperiode.
- Filtrene kjøres serverside mot databasen med paginering («Last flere») så store selskaper ikke laster alt.

**Kortene**
- Rutenett: 1 kolonne på mobil, 2 på liten tablet, 3–4 på tablet/liten PC, 5 på store skjermer.
- Hvert kort viser: lite kartutsnitt av flysporet (statisk preview), dato/klokkeslett, drone (navn hvis satt, ellers modell + SN), pilot, varighet, distanse, maks høyde, og badge for kilde (DJI/ArduPilot/manuell) samt tilknyttet oppdrag hvis det finnes.
- Kort uten flyspor viser et nøytralt plassholderfelt i stedet for kart.
- Klikk på kort åpner `FlightAnalysisDialog` med full analyse (samme som «Analyser» andre steder).

## Teknisk

- Ny side-komponent `src/components/flightlogs/FlightLogsView.tsx` (lastes kun når fanen er aktiv), rendres fra `src/pages/Oppdrag.tsx` på samme måte som `DeviationsView` rendres i `Hendelser.tsx`.
- Data: `flight_logs` scopet på selskap via eksisterende RLS, kolonnesett fra `FLIGHT_ANALYSIS_COLUMNS` + felt for kortene. «Kun mine» filtreres på `user_id` og på pilot-koblingen i `flight_log_personnel`.
- Hook `src/hooks/useFlightLogsList.ts` for spørring, filtre, søk og paginering.
- Kortkomponent `src/components/flightlogs/FlightLogCard.tsx`; kartminiatyr med Leaflet (ikke-interaktiv, kun sporlinje + fitBounds), lat-lastet ved scroll for ytelse.
- Klikk kaller eksisterende `loadFlightAnalysisTrack(log)` og åpner `FlightAnalysisDialog` — ingen endringer i analysekoden.
- Alle nye strenger legges i `no.json` og `en.json`.

## Utenfor omfang

- Redigering/sletting av logger fra denne visningen (finnes allerede i analysedialogen).
- Endringer i selve flylogganalysen.
