# Auto-vis BarentsWatch AIS langs tegnet rute

Legg AIS-skipstrafikk inn i det eksisterende proximity-systemet, slik at båter innenfor 500 m av en rute som tegnes vises automatisk – også når "Skipstrafikk"-laget ikke er aktivert manuelt.

## Endringer

### `src/lib/routeProximityLayers.ts`
- Importer `fetchAisVesselsInBounds`-logikken (eller bruk direkte kall til `barentswatch-ais` edge function for å gjenbruke bbox/abort-mønsteret som de andre lagene).
- Legg til `ais` i `SourceCache`. Cache holdes per bbox-nøkkel med kort TTL (f.eks. 30 s) siden fartøy beveger seg; cache hindrer at små drag spammer edge-funksjonen.
- Ny `loadAisVessels(bbox, cache, signal)`:
  - Kaller `supabase.functions.invoke("barentswatch-ais", { body: { bounds: {...} } })`.
  - Returnerer rå `vessels[]`.
- Ny `renderAisVessels(layer, vessels)`:
  - Bruker samme `createVesselIcon`-stil som dagens NAIS-lag (gjenbruk via export fra `mapDataFetchers.ts`, eller dupliser en lett variant for proximity-paneet).
  - Markører plasseres i `routeProximityPane` (z-index 637) – ikke i `naisPane` – så vi unngår dobbel-rendering når brukeren senere skrur på det manuelle laget.
  - Popup som inkluderer `AUTO_BADGE` (📍 Auto-vist langs ruten).
- Filtrering: behold kun fartøy hvis posisjon ligger innenfor `bufferPolyline(validCoords, 500)` (samme buffer som brukes konseptuelt for de andre lagene). Bruk `pointInPolygon` mot buffer-polygonet for presis 500 m-grense, slik at vi ikke viser hele bbox-fyllingen.
- Legg `ais` til i `Promise.all`-blokken i `updateRouteProximityLayers`, med samme timeout/abort-håndtering. Skip hvis `activeManualLayers.ais === true`.

### `src/components/OpenAIPMap.tsx`
- Utvid `activeManualLayers`-objektet som sendes til `updateRouteProximityLayers` med `ais: map.hasLayer(naisLayer)`, slik at vi ikke dobler opp når brukeren har slått på "Skipstrafikk" manuelt.
- Sørg for at proximity-laget tømmes for AIS-features når ruten blir tom / inspect-mode osv. (allerede dekket via `layer.clearLayers()` i orchestratoren).
- Eksportér eller dupliser `createVesselIcon` / `getShipTypeName` fra `mapDataFetchers.ts` for gjenbruk.

### Edge function
Ingen endringer – `barentswatch-ais` aksepterer allerede `bounds` og returnerer `vessels[]`.

## Tekniske detaljer

- Bbox: gjenbruker `computeRouteBbox(coordinates, 500)`.
- Presis 500 m-filter: `bufferPolyline` + punkt-i-polygon for hvert fartøy før rendering.
- Cache-TTL: AIS-cachen lagrer `{ts, vessels}`; treff brukes bare hvis < 30 s gammelt. Andre lag (statiske) beholder uendret cache.
- Pane: `routeProximityPane` (eksisterende), så AIS-markører ligger over kartbakgrunn men under aktive popups.
- Mode-håndtering: marker `interactive: true` i route-planning (proximity-laget er ikke en del av klikk-for-å-legge-punkt; klikket går til ruten først – samme oppførsel som naturvern/CAA i dag).
- Ingen endring i lagmenyen – brukeren kan fortsatt aktivere "Skipstrafikk" manuelt for hele kartet.

## Verifisering
- Tegn en rute langs kysten → båter innenfor 500 m vises automatisk med 📍-badge.
- Slå på "Skipstrafikk" manuelt → proximity-AIS forsvinner (for å unngå duplikater), manuelle vessels overtar.
- Slett ruten → AIS-markører fra proximity-laget forsvinner.
