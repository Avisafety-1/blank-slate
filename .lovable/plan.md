

## Fix: NOTAM-markører bak andre luftromslag — dedikert SVG-renderer

### Rotårsak
Leaflet bruker én delt SVG-renderer for alle vektorlag (circleMarkers, polygoner). Selv om `pane` er satt korrekt, tegnes alle vektorlag i samme SVG-container — som betyr at `pane` z-index ikke har effekt for vektorer med standard renderer.

### Løsning
Opprette en **dedikert `L.svg()` renderer bundet til `notamPane`**. Dette tvinger NOTAM-vektorer inn i en separat SVG-container som lever i `notamPane` (z-index 1000), fullstendig adskilt fra andre luftromslags SVG.

### Endring

**Fil: `src/lib/mapDataFetchers.ts`**

1. I `fetchNotamsInBounds`, opprett en renderer helt i starten:
```ts
const notamRenderer = L.svg({ pane });
```

2. Legg til `renderer: notamRenderer` på `L.geoJSON`-kallet (linje 872):
```ts
const geoLayer = L.geoJSON(notam.geometry_geojson, {
  pane,
  renderer: notamRenderer,  // NY
  interactive: ...,
  bubblingMouseEvents: false,
  style: { ... },
});
```

3. Legg til `renderer: notamRenderer` på `L.circleMarker` i `addNotamCenterMarker` (linje 909). Funksjonen trenger å motta rendereren som parameter.

### Filer som endres
- `src/lib/mapDataFetchers.ts` — 3 små endringer (opprett renderer, pass den til geoJSON og circleMarker)

