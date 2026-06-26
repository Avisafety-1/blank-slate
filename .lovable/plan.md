## Problem
Angre-knappen i ruteplanleggeren kaller `routePointsRef.current.pop()`, som alltid fjerner siste punkt i arrayen. Etter at vi innførte innsetting mellom eksisterende punkter (og dra/slett), stemmer ikke «siste i arrayen» lenger med «sist lagt til», så feil punkt fjernes.

## Løsning
Erstatt pop-baserte angre med en historikk-stack som lagrer et snapshot av rutepunktene før hver mutasjon. Angre gjenoppretter forrige snapshot.

### Endringer i `src/components/OpenAIPMap.tsx`

1. Legg til `const routeHistoryRef = useRef<RoutePoint[][]>([])`.
2. Lag en helper `pushHistory()` som pusher en dyp kopi (`routePointsRef.current.map(p => ({...p}))`) før hver mutasjon. Cap stacken på f.eks. 50 entries.
3. Kall `pushHistory()` rett før hver av disse mutasjonene:
   - Klikk i kart som legger til nytt punkt (linje ~949 `push`).
   - Klikk på segment som setter inn punkt mellom to (linje ~380 `splice insert`).
   - Marker-drag som flytter punkt (linje ~430).
   - Høyreklikk/slett-punkt (linje ~441 `splice remove`).
   - `clearRoute` (snapshot før tømming så man kan angre clear).
   - Når `existingRoute` lastes første gang eller controlled-prop overskriver (linje 656, 1315): tøm historikk så angre ikke krysser oppdrag.
4. Omskriv `undoLastPoint`:
   - Hvis `routeHistoryRef.current.length === 0`: ingenting å gjøre.
   - Pop forrige snapshot, sett `routePointsRef.current = snapshot`, oppdater `routePointCount`, kjør `updateRouteDisplay()` og `onRouteChange` med oppdaterte coords/distance/area.
5. Behold knappen og tooltip, men oppdater tittel til «Angre siste endring».

### Ikke-endringer
- Ingen endringer i hvordan ruter lagres eller sendes til parent.
- Ingen UI-restrukturering utover evt. tooltip-tekst.