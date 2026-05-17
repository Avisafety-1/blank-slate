## Problem

I Norge tegnes SSB 250 m-ruter med pådriver automatisk så snart en rute med buffersoner planlegges. Utenfor Norge skjer ingenting på kartet selv om Eurostat-dataene finnes og `eurostat-population` svarer korrekt (verifisert med en Paris-bbox: returnerer ~40 000 pers/km² celler).

Rotårsak: `fetchSsbPopulationGridTiled` splitter alltid bbox i 4 km tiles. Det er tilpasset SSB sitt 250 m-grid, men for Eurostat sitt 1 km-grid er det altfor smått. En typisk Paris-rute (5 km + ~3 km adjacent + buffer) gir en bbox på ~25-30 km, som blir ~50-70 sekvensielle/4-parallelle edge-funksjonskall mot `eurostat-population`. I praksis tar dette så lang tid (eller faller ut med rate-limit / abort) at `soraDensityResult` aldri populeres, og `OpenAIPMap` får aldri `populationDensityCells` å tegne. Det er ingen visuell fallback eller feilmelding, så brukeren ser bare "ingenting".

I tillegg er metadata fortsatt hardkodet i `computeSoraVolumePopulationDensity` (`gridResolutionM: 250`), så panelet kan vise feil oppløsning når kun Eurostat-celler er med.

## Endringer

### 1. Tile-størrelse pr. kilde (`src/lib/adjacentAreaCalculator.ts`)

- Klassifiser bbox med `isBboxInNorway` *før* splitting:
  - Helt i Norge → behold 4 km tiles (SSB 250 m).
  - Helt utenfor Norge → bruk 25 km tiles (Eurostat 1 km tåler større bbox per kall; en Paris-rute blir 1-4 kall i stedet for 50-70).
  - Krysser grensen → split i 4 km tiles og la `fetchPopulationGridForTile` velge kilde pr. tile (uendret oppførsel).
- Implementer ved å legge til en `maxTileKm`-parameter i `splitBboxIntoTiles` og kalle den med riktig verdi fra `fetchSsbPopulationGridTiled` basert på klassifiseringen over.
- Behold `Promise.allSettled` og kildelogging.

### 2. Riktig metadata for Eurostat-resultater (`computeSoraVolumePopulationDensity`)

- Tell SSB- vs Eurostat-celler i `visibleCells` på samme måte som `computeAdjacentAreaDensity` allerede gjør.
- Sett `gridResolutionM` til 1000 når alle synlige celler er Eurostat, 250 ellers.
- (Valgfritt, ikke krav) eksponere `dataSource`-streng i `SoraPopulationDensityResult` slik panelet kan vise samme kilde-tekst som adjacent-resultatet.

### 3. Verifisering

- Test i Norge (Oslo): forventer SSB 250 m-ruter rendres som før, ingen regresjon.
- Test i Frankrike (Paris ~5 km): forventer Eurostat 1 km-polygoner tegnes automatisk i buffer + adjacent donut innen få sekunder, pådriver markeres, og panelet viser `Eurostat GEOSTAT 2021 1 km grid`.
- Test grense-case (Strömstad/Halden): forventer blanding av SSB- og Eurostat-celler.
- Bekreft via konsollen: `[adjacentArea] fetched N celler (SSB: x, Eurostat: y, tiles: z)`.

## Det dette IKKE endrer

- RPC `eurostat_pop_in_bbox`, edge-funksjonen `eurostat-population`, eller databaseskjema.
- Containment/pådriver-matrisen eller SORA-geometrien.
- Popup/tooltip-tekstene som allerede er kildebevisste.
- Eurostat WMS-overlayet (separat lag).
