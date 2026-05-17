Jeg fant at Eurostat-backenden og databasen fungerer: et direkte kall mot `eurostat-population` for Paris returnerer befolkede 1 km-ruter, så problemet ligger sannsynligvis i frontend-flyten for automatisk beregning/visning.

Plan:

1. Koble tilstøtende-beregningen direkte til kartvisningen
- Når `AdjacentAreaPanel` har beregnet befolkningstetthet, skal `densityCells` fra resultatet kunne sendes opp til `Kart.tsx`.
- `Kart.tsx` skal bruke disse cellene som fallback/primærkilde for `OpenAIPMap` når tilstøtende område er aktivt.
- Dette gjør at rutene som faktisk brukes i containment-beregningen også vises automatisk på kartet.

2. Gjør Eurostat automatisk på lik linje med SSB
- Behold SSB i Norge og Eurostat utenfor Norge, men sørg for at `showPopulationDensity` skrus på når SORA/tilstøtende områder aktiveres også utenfor Norge.
- Oppdater teksten i SORA-panelet fra “SSB 250 m” til kildebevisst tekst: SSB i Norge, Eurostat i Europa, eller blandet ved grensekryssing.

3. Fiks synlig “pådriver” for Eurostat-ruter
- Sørg for at høyeste tetthet innenfor bakkerisiko-/SORA-volum markeres som `isDriver` også når kilden er Eurostat.
- Tooltip/popup skal fortsatt vise “Pådriver for utregning”, men med Eurostat 1 km²-beregning, ikke `pop × 16`.

4. Legg inn tydelig feildiagnostikk uten å plage brukeren
- Logg når Eurostat returnerer 0 celler, når celler finnes men ingen treffer bufferpolygonet, og når kall avbrytes.
- Unngå at en abort/null-resultat skjuler tidligere gyldige celler hvis brukeren fortsatt er på samme rute.

5. Verifisering
- Test med et område i Norge for å sikre at SSB fortsatt fungerer.
- Test med et område i Europa, f.eks. Paris/København, for å bekrefte at Eurostat-ruter vises automatisk, pådriver markeres og beregningen vises i tilstøtende-området.
- Test en grensenær rute for blandet SSB/Eurostat-kilde.