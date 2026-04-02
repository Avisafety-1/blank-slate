

## Fix NOTAM-markører z-indeks og klikkbarhet

### Problem
NOTAM-markører (circleMarkers og GeoJSON-polygoner) vises under andre luftromslag og kan ikke klikkes, til tross for at `notamPane` har z-index 670.

### Rotårsak
To problemer:

1. **`bubblingMouseEvents`** er ikke satt til `false` på NOTAM-markørene. Dette gjør at musehendelser bobler opp gjennom pane-hierarkiet, slik at luftromspolygoner i andre panes fanger klikkene.

2. **DOM-rekkefølge**: NOTAM-laget legges til kartet (linje 438) **før** RMZ/RPAS/NSM-lagene (linje 442-452). I Leaflet kan DOM-rekkefølgen overstyrer pane z-index i visse tilfeller. NOTAM-laget bør legges til **etter** alle luftromslag for å sikre at det rendres sist i DOM.

### Løsning

**Fil: `src/lib/mapDataFetchers.ts`**

1. Legg til `bubblingMouseEvents: false` på NOTAM `circleMarker` (linje ~907):
```ts
const marker = L.circleMarker([notam.center_lat, notam.center_lng], {
  pane,
  radius: 8,
  fillColor: "#f39c12",
  color: "#e67e22",
  weight: 2,
  fillOpacity: 0.6,
  interactive: mode !== "routePlanning",
  bubblingMouseEvents: false,  // NY
});
```

2. Legg til `bubblingMouseEvents: false` på NOTAM GeoJSON-laget (linje ~872):
```ts
const geoLayer = L.geoJSON(notam.geometry_geojson as any, {
  pane,
  interactive: mode !== "routePlanning",
  bubblingMouseEvents: false,  // NY
  style: { ... },
});
```

**Fil: `src/components/OpenAIPMap.tsx`**

3. Flytt NOTAM-lagets opprettelse (linje 437-439) til **etter** alle luftromslag (etter linje 452), slik at det rendres sist i DOM:
```ts
// Luftromslag først
const rpasLayer = L.layerGroup().addTo(map);
const nsmLayer = L.layerGroup().addTo(map);
const aipLayer = L.layerGroup();
const rmzTmzAtzLayer = L.layerGroup().addTo(map);

// Live NOTAM – etter alle luftromslag for riktig DOM-rekkefølge
const notamLayer = L.layerGroup().addTo(map);
```

4. Sørg for at `layerConfigs`-arrayet oppdateres tilsvarende (rekkefølgen i UI-menyen kan beholdes uendret).

### Filer som endres
- `src/lib/mapDataFetchers.ts` — legg til `bubblingMouseEvents: false` på to steder
- `src/components/OpenAIPMap.tsx` — flytt NOTAM-lag til etter luftromslag i DOM-rekkefølge

