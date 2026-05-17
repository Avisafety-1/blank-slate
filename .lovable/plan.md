## Problem

Når SORA er aktivert i Norge tegnes SSB 250 m-rutene automatisk inni operasjonsvolum + tilstøtende donut. Utenfor Norge skjer ingenting visuelt — Eurostat-cellene rendres ikke i bufferen / tilstøtende området, selv om de er lastet inn i `eurostat_population_1km` og edge-funksjonen `eurostat-population` svarer.

Beregnings-pipelinen velger allerede SSB vs Eurostat pr. 4 km tile (`isBboxInNorway`), og `cellTouchesMultiPolygon` håndterer Eurostat sine 1 km polygoner. Likevel ser brukeren ikke noen overlay utenfor Norge. Den mest sannsynlige rotårsaken er en kombinasjon av (a) silent failure i `Promise.all`-batchet hvis én tile feiler, (b) hardkodet "SSB 250 m" i popup/tooltip/panel slik at brukeren ikke ser forskjell, og (c) ingen synlig diagnostikk når Eurostat returnerer 0 celler.

## Endringer

### 1. Robusthet i tiled fetch (`src/lib/adjacentAreaCalculator.ts`)
- Bytt `Promise.all` → `Promise.allSettled` i `fetchSsbPopulationGridTiled` slik at én feilet tile (f.eks. midlertidig 502) ikke nuller hele beregningen.
- Logg `console.warn` for hver rejected tile med bbox + feilmelding.
- Logg `console.info` med antall celler returnert pr. kilde (ssb / eurostat) når totalresultatet er klart, slik at det er trivielt å verifisere i konsollen.

### 2. Kildebevisst rendering (`src/components/OpenAIPMap.tsx`)
- I løkken som tegner `densityCells`:
  - Bytt hardkodet `"SSB 250 m-rute"` i popup ut med dynamisk tekst basert på `cell.source`: `"SSB 250 m-rute"` for `ssb`, `"Eurostat 2021 · 1 km-rute"` for `eurostat`.
  - Forklar tetthetsutregning korrekt pr. kilde (SSB: `pop × 16`, Eurostat: `pop = pers/km²`).
  - Tooltipen for pådriver-cellen får samme kildelabel.

### 3. Panel-tekst (`src/components/AdjacentAreaPanel.tsx`)
- Erstatt setningen som hardkoder "SSB 250m" med en kildebevisst beskrivelse: «I Norge brukes SSB 250 m. Utenfor Norge brukes Eurostat 2021 1 km.»
- Vis kildelabelen fra `result.dataSource` under resultatene i tillegg til `gridResolutionM`.

### 4. Legende (`src/components/BefolkningLegend.tsx`)
- Ingen endring kreves — komponenten støtter allerede `source="ssb" | "eurostat" | "both"`.

### 5. Verifisering
- Plan en kort rute i Paris (~5 km) med SORA aktivert.
- Forvent: 1 km Eurostat-polygoner fyller buffer + donut, popup viser "Eurostat 2021 · 1 km-rute", panelet viser `Eurostat GEOSTAT 2021 1 km grid`, og konsollen logger antall celler returnert pr. kilde.
- Plan en kort rute i Oslo som referansetest — skal fortsatt rendres som SSB 250 m.

## Det dette IKKE endrer

- Containment-matrisen, SORA-geometrien og pådriver-beregningen står som de er.
- Ingen DB-migrasjoner.
- Eurostat WMS-overlayet på kartet (separat togglebart lag) endres ikke.
