# Hakkete tilstøtende område rundt ruten

## Hva som skjer

Når ruten er en lukket sløyfe (flate med areal, som i skjermbildet: 0,38 km²) — eller når buffermodus står på «konveks» — tegnes tilstøtende område med en annen metode enn ved en åpen rute.

Den metoden flytter hver kant utover og lar de forlengede kantene møtes i et hjørnepunkt. På korte ruter med skarpe hjørner og en veldig stor avstand (5 km) havner disse møtepunktene langt utenfor der de skulle vært, og kantene krysser hverandre. Resultatet er en spiss, hakkete figur i stedet for en jevn sone 5 km ut fra ruten.

Når du starter på nytt og tegner en åpen rute, brukes en annen metode som legger runde hjørner og slår sammen delene korrekt — derfor ser det riktig ut da.

I tillegg er sorteringen som finner ytterkanten (konveks innhylling) av rutepunktene ustabil: rekkefølgen på punktene kan gi en ytterkant som ikke er helt konveks, noe som forsterker spissene. Det forklarer hvorfor feilen bare oppstår noen ganger.

## Hva som fikses

1. Bruk samme robuste metode for alle tilfeller: runde hjørner rundt hvert punkt og hvert linjestykke, slått sammen til én figur. Da blir sonen alltid jevn, uansett om ruten er åpen, lukket eller i konveks-modus.
2. Rett opp sorteringen i utregningen av ytterkanten, slik at ytterkanten alltid blir korrekt.
3. Kjør resultatet gjennom samme opprydding som de andre sonene, slik at eventuelle kryssende kanter fjernes.

Dette gjelder både tilstøtende område og SORA-buffersonene (grønn/gul/rød), som bruker samme kode og kan få samme spisser ved store avstander.

## Teknisk

- `src/lib/soraGeometry.ts`
  - `computeConvexHull`: bytt til en stabil sortering (forhåndsberegnet vinkel/avstand, uten `a === start`-spesialtilfelle i komparatoren) og fjern duplikate punkter.
  - `bufferPolygon`: legg inn miter-grense og buerundede hjørner, og kjør resultatet gjennom `normalizePolygon` før retur. Alternativt (foretrukket) rutes konveks/lukket-tilfellet til `mergeBufferedCorridorPolygons` på det lukkede ringsettet, slik at polygon-clipping håndterer sammenslåing og selvkryss.
  - `renderAdjacentAreaZone.makeAdjacentBuffer` og `renderSoraZones.makeMergedBufferLatLngs`: bruk samme buffermetode i alle grener; behold eksisterende stil, popup og farger.
  - Øk `numCapSegments` for store avstander (f.eks. skaler antall segmenter med radius) så 5 km-sonen får jevn kant.
- Ingen databaseendringer, ingen endringer i beregnede tall (radius, areal, befolkning) — kun geometrien som tegnes.
- Validering: `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`, samt visuell kontroll med både åpen rute, lukket sløyfe og konveks-modus.
