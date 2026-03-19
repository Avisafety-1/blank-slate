
Mål: gjøre Flyanalyse-kartet stabilt og fjerne “helt hvitt kart” i dialogen.

Hva jeg sjekket
- `FlightAnalysisDialog.tsx`: kartet initieres i en portal-dialog med `ResizeObserver` + kort timeout.
- `ExpandedMapDialog.tsx`: har en mer robust init-strategi med retry, forsinket oppstart og flere `invalidateSize()`-kall.
- Konsollogger: ingen Leaflet-feil, bare Dialog accessibility-advarsel.
- Preview-snapshot: ingen OSM tile requests ble fanget opp da problemet skjedde.
- Database: den aktuelle flyturen 18.12.2025 for `UASVOSS M350` har gyldig `flight_track` med 168 posisjoner og normale koordinater rundt Voss. Dataene er altså ikke problemet.

Konklusjon
- Dette ser ut som et UI/livssyklus-problem i `FlightAnalysisDialog`, ikke et telemetry-problem.
- Den nåværende “vent til container har størrelse”-fixen er fortsatt for svak for dialog/animasjon/portal-scenariet. Kartet blir noen ganger aldri ordentlig initialisert eller invalidert etter at dialogen er ferdig rendret.

Plan
1. Bytt `FlightAnalysisDialog` til samme robuste init-mønster som brukes i `ExpandedMapDialog`
- Erstatt dagens `ResizeObserver`-styrte init med en `tryInitMap()`-flyt:
  - vent til container faktisk har bredde/høyde
  - retry noen ganger med korte intervaller
  - fjern eventuell eksisterende Leaflet-instans trygt før ny init
  - initier kartet i `try/catch`
- Dette reduserer risikoen for at kartet startes mens dialogen fortsatt er i overgang/animasjon.

2. Legg inn eksplisitt “stabiliseringsfase” etter init
- Kjør flere forsinkede `invalidateSize()`-kall, f.eks. etter 300 / 500 / 800 ms, slik `ExpandedMapDialog` gjør.
- Lytt på dialogens ferdige overgang (`transitionend`) eller kjør ekstra `requestAnimationFrame`-basert invalidation etter mount.
- Dette er sannsynligvis den viktigste forskjellen mellom den ustabile og den stabile kartimplementasjonen.

3. Skill mellom “map exists” og “map ready”
- Legg inn lokal state som `mapReady` / `tileStatus`.
- Ikke kjør marker-/trail-oppdateringer før kartet faktisk er klart.
- Da unngår vi at `panTo`, polyline og markører jobber mot et kart som fortsatt er halvveis initialisert.

4. Legg til tile-diagnostikk og brukerfallback
- Registrer `tileload` / `tileerror` på `L.tileLayer`.
- Hvis tiles ikke lastes innen kort tid, vis en liten feilmelding i kartflaten i stedet for bare hvitt område, f.eks. “Kartet kunne ikke lastes – prøv å åpne analysen på nytt”.
- Dette gjør problemet synlig og mye lettere å feilsøke videre hvis noe eksternt feiler.

5. Rydd opp i dialogen samtidig
- Legg til `DialogDescription` i `FlightAnalysisDialog` for å fjerne Radix-advarselen i konsollen.
- Ikke kritisk for kartet, men det gjør debugging renere.

Filer som bør endres
- `src/components/dashboard/FlightAnalysisDialog.tsx` (hovedfix)
- Eventuelt liten justering i `src/components/ui/dialog.tsx` bare hvis vi trenger en ref/transition-hook fra dialoginnholdet, men sannsynligvis ikke nødvendig.

Forventet resultat
- Kartet åpner stabilt også i Flyanalyse-dialogen.
- Ikke hvit kartflate ved første åpning.
- Bedre robusthet ved gjentatt åpne/lukke, scrubbing i tidslinjen og etter at appen har vært i bakgrunnen.

Verifisering etter implementasjon
- Åpne Flyanalyse for `UASVOSS M350` 18.12.2025 flere ganger på rad.
- Test både direkte åpning og etter scrolling i loggboka.
- Dra scrubberen raskt frem og tilbake.
- Lukk og åpne analysen igjen.
- Test etter at fanen/appen har vært i bakgrunnen.
- Bekreft at OSM tiles faktisk lastes, og at fallback-melding vises hvis de ikke gjør det.
