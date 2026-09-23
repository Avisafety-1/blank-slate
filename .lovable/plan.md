# Flere ruter og satellittkart i oppdragsrapporten

Rapportvalget utvides slik at du kan velge hvilke ruter som skal med, kartbildet tegner alle valgte ruter, koordinatlisten vises per rute, og du kan velge satellittbakgrunn i rapportkartet.

## Slik blir det i bruk

1. I «Eksporter rapport»-dialogen, under Kart og luftrom, kommer et nytt valg for kartbakgrunn: **Standard kart** eller **Satellitt**.
2. Har oppdraget flere ruter, vises en liste med avkryssing per rute («Rute 1», «Rute 2» eller rutens navn, med fargeprikk og antall punkter/km). Alle er avkrysset som standard.
3. Kartbildet i rapporten tegner alle valgte ruter, hver i sin rutefarge, med start-/sluttmarkør og nummererte punkter per rute. SORA-buffersonene tegnes for hver valgte rute.
4. «Rutekoordinater» viser nå én tabell per valgt rute med egen overskrift og oppsummering (antall punkter, distanse), pluss en totalsum når det er flere ruter.
5. Har oppdraget bare én rute, ser dialogen ut som i dag (ingen ruteliste), men satellittvalget er tilgjengelig.
6. Luftromsvarsler beregnes fortsatt for rutene på oppdraget, men begrenses til de valgte rutene.

## Teknisk

**`src/lib/mapSnapshotUtils.ts`**
- `MapSnapshotInput` får `selectedRouteIds?: string[]` og `basemap?: "standard" | "satellite"`.
- Ruter leses med `segmentsFromRouteData` i stedet for kun `route.coordinates`; filtreres på `selectedRouteIds`.
- `loadTile` tar imot URL-mal: OSM (`{s}.tile.openstreetmap.org/{z}/{x}/{y}`) eller Esri World Imagery (`server.arcgisonline.com/.../World_Imagery/MapServer/tile/{z}/{y}/{x}`) fra `openAipConfig.tiles`. Attribusjonsteksten nederst byttes tilsvarende (Esri ved satellitt).
- Bounds, SORA-buffere (`bufferPolyline`/`bufferPolygon`/`computeConvexHull`), polylinjer og markører kjøres i løkke per rute. Rutefarge hentes fra `routeColor(index)` i `src/lib/routeSegments.ts`; start/slutt beholder grønn/rød, mellompunkter får rutefargen. Ved satellitt brukes litt tykkere hvit kontur rundt linjer og tekst for lesbarhet.

**`src/lib/oppdragPdfExport.ts`**
- `DEFAULT_PDF_SECTIONS` utvides med `mapBasemap: "standard"`. Valgte ruter sendes som eget argument (`selectedRouteIds?: string[]`) til `exportToPDF`, ikke i `PdfSections`, siden id-ene er oppdragsspesifikke.
- Luftromsberegningen (linje ~117-150) filtrerer `segments` på valgte ruter.
- Kartseksjonen sender `selectedRouteIds` og `basemap` videre; tegnforklaringen får en linje per rute med rutefarge og navn når det er flere ruter.
- Rutekoordinat-seksjonen (linje ~310-353) bygges om til en løkke over valgte segmenter: overskrift «Rute N» (eller navn), infotabell og koordinattabell per rute, med sidebrudd-håndtering som i dag, og en totalsumsrad når det er flere ruter.

**`src/components/oppdrag/dialogs/OppdragDialogs.tsx`**
- Nytt lokalt state for valgte rute-id-er, initialisert fra `segmentsFromRouteData(mission.route)` når dialogen åpnes/oppdrag endres.
- Ruteliste med `Checkbox` per rute (vises kun ved ≥2 ruter) og en radiogruppe/segmentert valg for kartbakgrunn.
- «Velg alle / fjern alle» dekker også rutene.
- Kalleren i `src/pages/Oppdrag.tsx` sender de valgte rute-id-ene inn i `exportToPDF`.

**i18n**: nye nøkler i `src/i18n/locales/no.json` + `en.json` (`oppdragDialogs.mapBasemap`, `.basemapStandard`, `.basemapSatellite`, `.routesToInclude`) og i `no/pdf.json` + `en/pdf.json` (`mission.route.routeHeading`, `mission.route.allRoutesTotal`, `mission.map.legend.routeN`, `mission.map.attributionEsri`).

**Validering**: `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`.

## Utenfor omfang

- Ingen databaseendringer.
- Satellittvalg gjelder kun rapporten, ikke lagret kartpreferanse.
