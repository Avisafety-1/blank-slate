## Mål
Klikk på den blå rutelinjen mellom to rutepunkter skal sette inn et nytt rutepunkt akkurat der man klikket. Etterfølgende punkter renummereres automatisk (gammelt 3 → 4 osv.).

## Endring
Kun i `src/components/OpenAIPMap.tsx`, inne i `updateRouteDisplay`:

I dag tegnes hele ruten som én sammenhengende `L.polyline`. Vi bytter til å tegne ett segment per par av punkter, slik at vi vet hvilken indeks et klikk hører til.

For hvert segment `i → i+1` (når `modeRef.current === 'routePlanning'`):

1. Tegn det synlige segmentet som i dag (blå, weight 3, dashed, `routePane`).
2. Tegn en usynlig "hit-area"-polyline oppå:
   - `weight: 20`, `opacity: 0`, `interactive: true`, samme pane.
   - Cursor settes til `pointer` via `className`.
3. Lytt på `click` på hit-area:
   - `L.DomEvent.stopPropagation(e)` så kartets generelle klikk ikke også legger til punkt på enden.
   - Sett inn `{ lat: e.latlng.lat, lng: e.latlng.lng }` i `routePointsRef.current` på posisjon `i + 1` via `splice(i + 1, 0, …)`.
   - Kall `updateRouteDisplay()` og `onRouteChangeRef.current(...)` med oppdaterte koordinater/distanse/areal — samme pattern som `dragend`/`contextmenu` allerede bruker.

Når `modeRef.current !== 'routePlanning'`: behold dagens enkle, ikke-interaktive polyline (ingen hit-area, ingen klikkinnsetting).

Renummerering er automatisk siden markørene tegnes på nytt fra `points.forEach((p, index) => ...)` i samme funksjon — etiketten er `index + 1`, og first/last-farger (grønn/rød) regnes på nytt.

## Ikke endret
- Tegning av selve markørene, drag, høyreklikk-sletting, popup-innhold.
- Klikk på tomt kart for å legge til punkt på enden (dagens `map.on('click', …)`-håndtering).
- Områdeberegninger / SORA-oppdateringer (utløses fra `onRouteChange` som før).
- Ingen endringer i `Kart.tsx` eller andre filer.