## Problem

`OpenAIPMap` har en useEffect:
```ts
useEffect(() => {
  if (initialCenter && leafletMapRef.current) {
    leafletMapRef.current.setView(initialCenter, 13);
  }
}, [initialCenter]);
```
I forrige endring sender `Kart.tsx` nå `sharedView?.center` som `initialCenter`. Hver `moveend` i 2D oppdaterer `sharedView` → ny array-referanse → useEffect snapper kartet tilbake til 13-zoom og samme senter → konstant loop som gjør at panorering/zoom ikke fungerer.

## Fix

### 1) `src/pages/Kart.tsx`
- Slutt å sende live `sharedView?.center` som `initialCenter` til `OpenAIPMap`. I stedet, lag en **ref-snapshot** som bare oppdateres når 2D-kartet er i ferd med å mountes (dvs. ved bytte fra 3D → 2D). Da brukes sharedView som start-senter for den nye 2D-instansen, men senere `sharedView`-oppdateringer påvirker ikke en allerede mountet 2D.
  - `const lastSharedViewRef = useRef<{ center: [number, number]; zoom: number } | null>(null);`
  - I `handleViewChange`: oppdater både `sharedView`-state og `lastSharedViewRef.current` (ref tar ikke re-render).
  - I render: `initialCenter={routePlanningState?.initialCenter ?? (justSwitchedFrom3DRef.current ? lastSharedViewRef.current?.center : undefined)}`.
  - Enklere variant: bruk en `useMemo`/lokal variabel som kun returnerer sharedView-senteret ved første render av 2D etter `is3D` ble false. Track via en `useRef` som settes når `is3D` veksler.

- Tilsvarende for `Map3D`: send `initialCenter={lastSharedViewRef.current?.center}` (kun lest ved mount; MapLibre re-leser ikke prop senere). `Map3D` mountes også på nytt ved hver veksling, så ref-verdien er fersk.

### 2) `src/components/OpenAIPMap.tsx`
- For å være robust: legg til en toleransesjekk i recenter-useEffect (linje 1238–1243) så den ikke snapper når forespurt senter er ~likt nåværende:
  ```ts
  useEffect(() => {
    if (!initialCenter || !leafletMapRef.current) return;
    const cur = leafletMapRef.current.getCenter();
    const dLat = Math.abs(cur.lat - initialCenter[0]);
    const dLng = Math.abs(cur.lng - initialCenter[1]);
    if (dLat < 1e-4 && dLng < 1e-4) return; // allerede der — ikke snap
    leafletMapRef.current.setView(initialCenter, 13);
  }, [initialCenter]);
  ```
  Dette beskytter også mot fremtidige tilsvarende feil.

### 3) Ingen endringer i Map3D nødvendig
MapLibre leser `initialCenter` kun i konstruktøren én gang per mount, så loop-problemet finnes ikke der.

## Resultat
- 2D-kartet kan panoreres/zoomes fritt igjen.
- 2D ↔ 3D bytte beholder fortsatt center/zoom: refen oppdateres på `moveend` fra begge kart, og brukes som start-senter for det nye kartet ved mount.
