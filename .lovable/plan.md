Plan:

1. Fiks valg av datakilde for befolkningsruter
- Erstatt dagens grove `isBboxInNorway`-sjekk i `adjacentAreaCalculator.ts` med en mer presis kildevelger.
- Årsaken ser ut til å være at dagens Norge-boks (`lng 4–32`, `lat 57.5–71.5`) også dekker Sverige. Ruter i Sverige blir derfor sendt til `ssb-population` i stedet for `eurostat-population`, og da kommer det ingen celler tilbake.
- Bruk SSB bare for tiles som faktisk ligger i Norge/Svalbard, og bruk Eurostat for Sverige og resten av Europa.

2. Legg inn trygg fallback til Eurostat
- Hvis et tile blir forsøkt hentet fra SSB, men returnerer 0 celler utenfor presist norsk område, skal klienten automatisk prøve Eurostat for samme bbox.
- Dette gjør flyten robust ved grenseområder og forhindrer at feil kildevalg gir tomt kart.

3. Sørg for at buffersoner/SORA bruker samme celler som kartet viser
- Behold eksisterende sammenslåing av `soraDensityResult.cells` og `adjacentResult.densityCells`.
- Sikre at Eurostat-cellene som brukes i beregningen også sendes til `OpenAIPMap` og rendres automatisk når SORA-volum/buffersoner er aktivt.

4. Behold riktig beregning og merking
- Eurostat-celler skal regnes som 1 km², altså `densityPerKm2 = population`.
- SSB 250 m skal fortsatt bruke `population × 16`.
- Høyeste relevante rute skal fortsatt markeres som “Pådriver for utregning”.

5. Verifisering
- Test direkte med Sverige/Gøteborg-bbox mot Eurostat-kallet.
- Sjekk at rute med buffersoner i Sverige trigger Eurostat og gir celler.
- Sjekk at Norge fortsatt bruker SSB 250 m, og at grensenære ruter kan håndtere blandet SSB/Eurostat.