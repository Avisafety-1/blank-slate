# Flere ruter på oppdragskortene

Oppdragskortene og oppdragsdialogen viser i dag bare den første/aktive ruten. Nå skal alle ruter vises — både i «Planlagt rute»-seksjonen og i kartutsnittet.

## Slik blir det

**Rute-seksjonen**
- Har oppdraget bare én rute: uendret visning (antall punkter + km).
- Har oppdraget flere ruter: en linje per rute — «Rute 1 · 5 punkter · 2,30 km», «Rute 2 · 4 punkter · 1,10 km» osv. Hver linje får en liten fargeprikk som matcher rutefargen i kartet (samme palett som ruteplanleggeren).
- Nederst en totalsum: antall ruter, totalt antall punkter og total distanse.

**Kartutsnittet**
- Alle ruter tegnes, hver i sin farge, med punktnummerering som starter på 1 per rute.
- SORA-buffersoner tegnes for hver rute.
- Kartet zoomes ut så alle rutene (pluss flyspor/NOTAM som i dag) får plass innenfor utsnittet.

Gjelder både oppdragskortene på /oppdrag og kartet/ruteseksjonen i oppdragsdialogen, siden begge bruker samme kartkomponent.

## Teknisk

**`src/components/dashboard/MissionMapPreview.tsx`**
- Erstatt den lokale `RouteData`-typen med typen fra `src/types/map.ts` og hent rutene via `segmentsFromRouteData(route)` (`src/lib/routeSegments.ts`), som allerede håndterer eldre ruter uten `routes`-felt som én rute.
- Løkke over segmentene: polyline + markører per rute, farge fra `routeColor(index)`; første/siste punkt beholder grønn/rød markering, mellomliggende bruker rutefargen. Popup/tooltip viser «Rute N · punkt X» når det finnes flere ruter.
- `renderSoraZones` kalles per segment inn i samme `soraLayer`.
- Alle punkter fra alle segmenter legges i `allPoints` før `fitBounds`, slik at utsnittet dekker hele oppdraget.

**`src/components/oppdrag/MissionCard.tsx`** (rute-seksjonen, ca. linje 526–544)
- Beregn segmenter med `segmentsFromRouteData(mission.route)`; render én rad per rute ved >1 rute, ellers dagens enkeltrad. Fargeprikk fra `routeColor(index)`.

**`src/components/dashboard/MissionDetailDialog.tsx`**
- Samme ruteliste over kartet der ruteinfo vises, slik at dialogen matcher kortet.

**i18n**: nye nøkler i `no.json` + `en.json` (`routeN`, `routesTotal`), brukt via `t()`.
