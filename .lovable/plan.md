

## Fix NOTAM-markører som vises under luftromslag

### Problem
NOTAM-markører (blå pinner) vises under luftromspolygoner på kartet, selv om `notamPane` har z-index 670.

### Rotårsak
I `src/lib/mapDataFetchers.ts` linje 178-187 er `pane`-egenskapen for AIP-soner plassert **inne i `style`-objektet**. Leaflet ignorerer `pane` i `style` — den må være en top-level option på `L.geoJSON()`. Dette betyr at alle AIP-polygoner (P/R/D, CTR, RMZ, TMZ, ATZ, TIZ) rendres i Leaflets standard `overlayPane` i stedet for sine tiltenkte panes (`aipPane`, `rmzPane`).

Selv om `overlayPane` (z-index 400) teknisk sett er under `notamPane` (670), kan DOM-rekkefølge og SVG-rendering forstyrre den visuelle stablingsrekkefølgen.

### Løsning

**Fil: `src/lib/mapDataFetchers.ts`**

1. **Flytt `pane` ut av `style`-objektet** for AIP-soner (linje ~178-187):
   - Gjør `pane` til en top-level option i `L.geoJSON()`-kallet, ved siden av `interactive` og `style`
   - Fjern `pane` fra `style`-objektet

Endring fra:
```ts
const geoJsonLayer = L.geoJSON(geojsonFeature, {
  interactive: mode !== 'routePlanning',
  style: {
    color, weight: 2, fillColor: color, fillOpacity, dashArray,
    pane,  // ← BUG: ignoreres av Leaflet her
  },
  ...
});
```

Til:
```ts
const geoJsonLayer = L.geoJSON(geojsonFeature, {
  interactive: mode !== 'routePlanning',
  pane,  // ← Riktig plassering
  style: {
    color, weight: 2, fillColor: color, fillOpacity, dashArray,
  },
  ...
});
```

Dette fikser pane-tilordningen for alle luftromslag, slik at z-index-hierarkiet fungerer korrekt og NOTAM-markører (670) vises over AIP (640) og RMZ (635).

### Fil som endres
- `src/lib/mapDataFetchers.ts` — én endring i AIP GeoJSON-rendering (~linje 178)

