## Problem

Rutelinja tegnes som SVG-overlay via `map.project()`, som er terreng-bevisst når 3D-terreng er aktivt — derfor sitter linja korrekt på bakken. Rutepunkt-markørene er derimot vanlige `maplibregl.Marker`-instanser opprettet med kun `lng/lat`. De får ingen høydereferanse, så MapLibre projiserer dem som om de står på havnivå (z=0). Når kartet er rotert/pitchet flytter de seg derfor bort fra det reelle bakkepunktet og kan havne under terreng eller langt ute i sjøen.

## Løsning

Bruk samme terreng-bevisste projeksjon for markørene som for linja. To realistiske veier:

### Alternativ A (anbefalt): Sett `Marker`-elevation fra terrain hver frame
- Behold `maplibregl.Marker` (drag, contextmenu, DOM-elementet uendret).
- Etter at terrain er aktivt, kall `map.queryTerrainElevation([lng, lat])` for hvert rutepunkt og sett markørens offset/altitude slik at den festes til bakken.
- MapLibre v4 har ikke et offisielt `altitude`-felt på Marker, men vi kan oppdatere markørens posisjon hver `render`-tick ved å bruke `marker.setLngLat([lng, lat])` kombinert med `marker._pos`-justering via `map.project` på et 3D-punkt `[lng, lat, elev]`. Konkret bruker vi `map.transform.locationPoint3D({lng, lat, alt: elev})` (intern, men stabil i v4) — eller faller tilbake til alternativ B hvis API-et er ustabilt.

### Alternativ B (mer robust): Render markørene som DOM-overlay
- Fjern `maplibregl.Marker`. Plasser markør-DOM-elementene absolutt i samme overlay-container som SVG-ruta.
- Hver `render`/`move`/route-endring: kjør `map.project([lng, lat])` (terreng-bevisst, samme som SVG-linja) og sett `transform: translate(x, y)` på hvert markør-element.
- Drag implementeres med `mousedown`/`touchstart` på elementet → `map.unproject` ved `mousemove` (samme transformasjon, så drop-punkt blir konsistent med visuelle posisjonen). Contextmenu/sletting beholdes likt.
- Z-order: markører over SVG-linja, under UI-knapper.

Velger **Alternativ B**, fordi:
- Det er garantert konsistent med rutelinja (samme projeksjonsmetode).
- Unngår avhengighet til udokumenterte interne maplibre-APIer.
- Markører forsvinner ikke under terreng selv om elevation-query feiler.

## Endringer

**Fil:** `src/components/Map3D.tsx`

1. **Fjern `routeMarkersRef` / `maplibregl.Marker`-bruken** i `rebuildMarkers`. Behold `buildMarkerEl` (samme utseende/nummerering).
2. **Ny `routeMarkerOverlayRef`**: en `<div>` i samme overlay-container som SVG-ruta. Append markør-DOM-elementene her ved `rebuildMarkers`.
3. **Ny `updateRouteMarkersScreen`**: itererer `routePointsRef.current`, kaller `map.project([lng, lat])`, setter `style.transform = translate(-50%, -50%) translate3d(x, y, 0)` på hvert element. Skjul (display:none) hvis projeksjon er utenfor viewport eller ikke-endelig.
4. **Drag-håndtering**: pointerdown på markør → registrer offset → pointermove på window → `map.unproject(screenPos)` → oppdater `routePointsRef.current[idx]` + `rebuildRouteSourcesRef.current()` + `updateRouteScreenPath()` + `updateRouteMarkersScreen()`. pointerup → `emitRouteChange()`.
5. **Contextmenu**: identisk med dagens (slett punkt, rebuild).
6. **Kall `updateRouteMarkersScreen()`** på de samme triggerne som `updateRouteScreenPath()`: `move`, `render`, rute-endringer, mode-bytte.
7. **Cleanup** ved mode-bytte/unmount: tøm overlay-containeren.

## Det som IKKE endres

- SORA-buffer-beregning, segmentlogikk, høyder, opacities.
- SVG-rute-overlayen (linje + halo) — fungerer allerede riktig.
- 3D-soner (fill-extrusion) og terrain-konfigurasjon.
- 2D-kartet er upåvirket (samme markør-DOM, samme `map.project`).
