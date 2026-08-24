# Flere ruter på samme oppdrag

Mulighet for å tegne flere separate ruter i ruteplanleggeren, bytte mellom dem på kartet, og lagre alle på oppdraget. SafeSky-valg kommer senere.

## Slik blir det i bruk

1. Du tegner rute som i dag. Når første punkt er lagt ned dukker en **+**-knapp opp i ruteplanlegger-headeren.
2. Klikker du **+** med bare 1 eller 2 punkter, får du en melding: en rute må ha minst 3 punkter før du kan starte en ny.
3. Med 3+ punkter oppretter **+** en ny, tom rute. Neste klikk i kartet starter en helt ny linje som ikke henger sammen med den forrige.
4. Når det finnes flere ruter vises en liten rute-velger i kartet (chips «Rute 1 / Rute 2 / …» øverst til venstre over kartet). Aktiv rute er markert; klikk på en annen for å jobbe videre med den.
5. Kun aktiv rute kan redigeres (dra punkter, sette inn midt i segment, slett punkt, angre, tøm). Inaktive ruter tegnes dempet i bakgrunnen så du ser helheten.
6. SORA-buffersoner beregnes og tegnes for hver rute etter samme regler som i dag.
7. Lagring: alle rutene lagres på oppdraget. Presentasjon på oppdragskortene tas i en senere runde.

### Nummerering av punkter

Hver rute starter på **1**. For å unngå forveksling når flere ruter vises samtidig får markørene rutefarge, og popup/tooltip viser «Rute 2 · punkt 1». Aktiv rute beholder dagens fargekoding (grønn start, blå mellom, rød slutt); inaktive ruter tegnes i en dempet variant av rutens farge.

## Teknisk

**Datamodell** (`src/types/map.ts`)
- Ny `RouteSegment { id: string; name?: string; coordinates: RoutePoint[]; totalDistance: number; areaKm2?: number }`.
- `RouteData` utvides med `routes?: RouteSegment[]` og `activeRouteId?: string`.
- Bakoverkompatibilitet: `coordinates`/`totalDistance` på toppnivå fortsetter å speile **første** rute, slik at alt eksisterende (SORA-analyse, AI-risiko, PDF, KMZ, FH2, oppdragskort, MissionMapPreview) fungerer uendret på gamle og nye oppdrag. Gamle ruter uten `routes` leses som én rute.

**Kart** (`src/components/OpenAIPMap.tsx`)
- `routePointsRef` erstattes av `routesRef: RouteSegment[]` + `activeRouteIdRef`. Alle skrive-punkter (kartklikk, drag, insert, slett, angre, tøm) opererer på aktiv rute; angre-historikken holdes per rute.
- `updateRouteDisplay` tegner alle ruter: aktiv med dagens stil og interaktive markører, inaktive som dempet polyline uten drag-handles.
- SORA: `renderSoraZones` kalles per rute inn i `soraLayerRef` med samme `soraSettings`.
- Nærhets-lagene (`updateRouteProximityLayers`, `updateUnifiedRouteProximityLayers`) får sammenslåtte koordinater fra alle rutene, så luftroms-/naturvarsler dekker hele oppdraget.
- `onRouteChange` sender `RouteData` med både `routes` og speilet førsterute.
- Rute-velger-chips rendres som overlay i kartcontaineren (samme z-index-mønster som eksisterende kartkontroller).

**Ruteplanlegger-header** (`src/pages/Kart.tsx`)
- Ny **+**-knapp ved siden av eksisterende knapper (pin/angre/slett/lukk/lagre), synlig når aktiv rute har ≥1 punkt. Ved <3 punkter vises en toast med forklaring i stedet for å opprette ny rute.
- Header-teksten viser antall punkter for aktiv rute og totalsum på tvers av ruter.
- `handleSaveRoute` lagrer hele `RouteData` inkl. `routes` til `missions.route` (ingen skjemaendring — feltet er jsonb).
- Angre/tøm gjelder aktiv rute; tøm på en tom ekstra rute fjerner ruten og gjør forrige aktiv.

**i18n**: nye nøkler i `no.json` + `en.json` (`newRoute`, `needThreePoints`, `routeLabel`, `activeRoute`).

## Utenfor omfang nå
- Valg av hvilken rute som publiseres til SafeSky.
- Visning av flere ruter på oppdragskort/PDF (viser fortsatt første rute).
