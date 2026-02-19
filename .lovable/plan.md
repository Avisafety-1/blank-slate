
## Fiks: Invalid LatLng (NaN, NaN) ved SORA-sonerendering

### Rotårsak

Feilen oppstår i `renderSoraZones` i `src/lib/soraGeometry.ts` når Leaflet forsøker å tegne SORA-soner for et oppdrag (f.eks. "safesky test 2") som enten:

1. Har koordinater der `lat` eller `lng` er `null`, `undefined`, eller `0` (som oppfyller `isFinite`-sjekken men produserer `NaN` i den lokale metriske projeksjonen)
2. Eller der bufferfunksjonene (`bufferPolyline`, `bufferPolygon`) returnerer koordinater med `NaN` fordi `lngScale` eller `latScale` gir 0 ved ekstremalverdier

Den eksisterende tidlig-exit-sjekken (`coordinates.some(p => !p || !isFinite(p.lat) || !isFinite(p.lng))`) validerer input, men **ikke output** fra bufferfunksjonene. Koordinater som `{ lat: 0, lng: 0 }` er `isFinite`, men kan gi meningsløse buffer-resultater. Og etter at bufferberegning er ferdig, sendes resulterende polygonpunkter direkte til `L.polygon()` uten noen ny NaN-sjekk.

### Løsning

Legg til en **post-buffer NaN-filter** på alle koordinat-arrays like før de sendes til `L.polygon()` i `renderSoraZones`.

Konkret endres tre steder i `renderSoraZones` (linje ~270–305 i `soraGeometry.ts`):

1. `fgaZone` — Flight Geography Area polygon
2. `contingencyZone` — Contingency Area polygon  
3. `groundRiskZone` — Ground Risk Buffer polygon
4. `flightGeo` — den 1m-buffered flightgeography baseline

For hvert av disse, filtrer ut punkter der `lat` eller `lng` er NaN **etter** buffer-beregning, og hopp over `L.polygon()`-kallet hvis resulterende array har færre enn 3 gyldige punkter.

### Teknisk implementasjon

I `renderSoraZones`, bytt ut direkte `L.polygon(zone.map(p => [p.lat, p.lng]))` med en helper:

```typescript
function safeLatLngs(zone: RoutePoint[]): [number, number][] {
  return zone
    .map(p => [p.lat, p.lng] as [number, number])
    .filter(([lat, lng]) => isFinite(lat) && isFinite(lng));
}
```

Og bruk denne i stedet for `.map(p => [p.lat, p.lng])` for hvert polygon-kall. Sjekk `safeLatLngs.length >= 3` før `L.polygon()` kalles.

I tillegg legges en ekstra guard i starten av `renderSoraZones` som sjekker at koordinatene har faktiske verdier (ikke `0,0` som er et «null island»-problem):

```typescript
// Filtrer bort nulløy-koordinater
const validCoords = coordinates.filter(
  p => p && isFinite(p.lat) && isFinite(p.lng) && !(p.lat === 0 && p.lng === 0)
);
if (validCoords.length < 1) return;
```

### Filer som endres

| Fil | Endring |
|---|---|
| `src/lib/soraGeometry.ts` | Legg til `safeLatLngs`-helper og bruk den i alle `L.polygon()`-kall i `renderSoraZones`. Legg til null-island-guard øverst i funksjonen. |

Ingen andre filer trenger endring — selve buffer-beregningslogikken er korrekt, problemet er kun mangel på output-validering før Leaflet-kallet.
