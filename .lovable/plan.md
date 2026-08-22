# Hvorfor «0 oppføringer i loggbøkene»

## Svar først

Tallene er faktisk korrekte — de er bare misvisende formulert.

Undersøkelse av databasen viser:

- Vanlig logging av en flytur oppretter **ingen** oppføring i dronens loggbok eller pilotens loggbok. Loggboken brukes til hendelser, vedlikehold, kvitteringer, advarsler og flyttinger — ikke én rad per flytur.
- Dronens loggbok får bare en rad hvis flyloggen har advarsler (lavt batteri, celleavvik, høyde) **og** brukeren huker av for å lagre advarselen i loggboken ved opplasting.
- Pilotens loggbok (personnel_log_entries) har i dag 17 rader totalt, hvorav bare 3 er knyttet til en flylogg. Ingen av dem tilhører denne flyturen.
- Flytiden akkumuleres direkte på dronen (og profilens flyvetimer) — ikke via loggbokoppføringer. Derfor står det 5,0 t akkumulert selv om oppføringene er 0.

I tillegg teller nåværende kode dronens oppføringer på «samme drone + samme dato», som verken er presist (kan fange opp urelaterte oppføringer samme dag) eller knyttet til denne loggen.

## Hva jeg foreslår å endre

Gjør «Hva denne loggen har oppdatert» ærlig og forståelig i stedet for å vise et rått 0-tall:

1. **Flytid** — vis flytid fra denne loggen, dronens akkumulerte timer og pilotens akkumulerte timer (fra profilen). Dette er det loggen faktisk oppdaterer.
2. **Advarsler lagret i dronens loggbok** — tell kun oppføringer av typen «Advarsel» på riktig drone og samme dato, og vis en kort forklaring: «Opprettes bare når advarsler fra flyloggen lagres i loggboken.»
3. **Oppføringer i pilotens loggbok** — tell kun rader som faktisk er knyttet til denne flyloggen (flight_log_id), med forklaring: «Flyturer havner ikke automatisk i pilotens loggbok; kun manuelle oppføringer og oppføringer knyttet til denne loggen vises her.»
4. Når et tall er 0, vis en dempet forklarende linje i stedet for bare «0», slik at det ikke ser ut som en feil.

## Teknisk

- `src/lib/flightAnalysisTrack.ts`: `loadFlightLogContext` — filtrer drone-tellingen på `entry_type = 'Advarsel'`, behold `flight_log_id`-filter for personell, og hent i tillegg pilotens `profiles.flyvetimer`.
- `src/components/dashboard/FlightSummaryPanel.tsx`: bygg om sporbarhets-boksen i «Loggført på»-fanen med forklarende hjelpetekst per rad og pilotens akkumulerte timer.
- Nye i18n-nøkler i `no.json` og `en.json` for forklaringene.

Ingen databaseendringer og ingen endring i hvordan flytid beregnes.
