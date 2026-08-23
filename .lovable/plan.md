# Fiks «Vises i dronens loggbok: Nei» etter flytting

## Hva som faktisk skjer

Flyttingen gikk riktig. I databasen er loggen (075f0252) nå knyttet til Autel EVO II, til Rikard V Bjørklund som pilot, og den har også et oppdrag knyttet til seg.

Feilen er kun i visningen: når analysen åpnes fra dronens loggbok, bygges sammendraget lokalt i loggbok-dialogen med bare et lite utvalg felter (drone-modell, pilotnavn, oppdrags-id). Sporbarhetsfeltene «vises i dronens loggbok», «vises i pilotens loggbok», akkumulert flytid og oppdragsnavn blir aldri fylt inn, og faller derfor tilbake til «Nei», «–» og «Ikke satt».

Åpnes samme logg fra et oppdragskort, hentes full kontekst og verdiene vises korrekt.

## Løsning

Hent full logg-kontekst også når analysen åpnes fra dronens loggbok, i stedet for det forhåndsbygde delvise sammendraget.

- I `DroneLogbookDialog.tsx` gjøres «Analyser»-knappen asynkron: den henter komplett analysepakke for den valgte flyloggen (samme funksjon som oppdragskortene bruker) før dialogen åpnes, med enkel lasteindikator på knappen.
- Listevisningen kan fortsatt bruke det lette, forhåndsbygde sporet – det er kun detaljvisningen som trenger full kontekst.
- Fallback: hvis full henting feiler, vis det eksisterende sporet som før.

## Teknisk

- `src/components/resources/DroneLogbookDialog.tsx`: behold `flight_logs`-raden per oppføring, kall `loadFlightAnalysisTrack(rawLog)` i onClick, sett resultatet i `analysisTrack`.
- Ingen endringer i database, i `flightAnalysisTrack.ts`-logikken eller i sporbarhetspanelet.
