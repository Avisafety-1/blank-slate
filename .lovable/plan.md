## Problem

I 3D-kartet er rutelinja drapert på terrenget (følger bakkenivå med terreng-eksagerering 1.3), mens rutepunkt-markørene (de nummererte sirklene) er HTML-elementer som plasseres på `lng/lat` uten terrenghøyde. Resultatet er at markør nr. 3 vises på den skjermposisjonen havnivå (0 m) ville hatt, ikke der terrenget faktisk er — så markøren "henger igjen" og kobler seg ikke til enden av den tegnede ruta.

Dette er en kjent begrensning i `maplibre-gl` v4 sin `Marker`-klasse: den løfter ikke markøren opp på terrenget automatisk slik f.eks. line-layer gjør via terrain-draping.

## Løsning

Behold de eksisterende draggable HTML-markørene (de fungerer for drag og høyreklikk-sletting), men kompenser for terrenghøyden hver gang kartet rendres:

1. I `rebuildMarkers` (Map3D.tsx ~linje 1094) — registrer én delt `render`-listener (ikke én per markør) som looper gjennom `routeMarkersRef.current`.
2. For hver markør:
   - Hent `lng/lat` fra markøren.
   - Spør `map.queryTerrainElevation([lng, lat])` for høyden i meter (returnerer 0 hvis terreng ikke er aktivt).
   - Multipliser med terrain-eksagereringen (1.3) som brukes i `setTerrain`.
   - Bruk `map.transform`/`map.project` til å beregne pikseldifferansen mellom punktet ved havnivå og samme punkt løftet til terrenghøyden, og sett denne som en vertikal offset på markørens DOM-element via `marker.setOffset([0, dyPx])`.
3. Rydd opp `render`-listeneren i `useEffect`-cleanup (samme sted som markørene fjernes i dag, linje ~821 og ~1475).
4. Trigge én umiddelbar oppdatering når markører bygges om (etter klikk, drag, sletting, import av rute) så de hopper på plass uten å vente på neste kamerabevegelse.

### Teknisk detalj

MapLibre v4 har ikke `Marker({ altitude })`. Den enkleste måten å projisere et 3D-punkt til skjerm i v4 er å bruke `map.transform.locationPoint3D({ lng, lat }, elevationMeters)` hvis tilgjengelig, ellers fall tilbake til å beregne `map.project` for både `(lng, lat)` med og uten terreng aktivt — i praksis bruker vi den interne `transform.locationPoint3D` med try/catch (og 0-offset som fallback) for å unngå avhengighet til en eventuell v5-oppgradering.

## Filer som endres

- `src/components/Map3D.tsx` — legg til terreng-kompensasjon for rutepunkt-markører, register/cleanup av render-listener.

## Hva som ikke endres

- Selve rutelinja, SORA-buffer-sonene, klikk-/drag-logikk og 2D-kartet.
- Ingen oppgradering av `maplibre-gl` (holder oss på v4 for å unngå sideeffekter).
