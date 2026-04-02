

## Fix: NOTAM-pinner (ikoner) bak andre luftromslag

### Problem
Når NOTAM GeoJSON inneholder `Point`-geometri, oppretter `L.geoJSON` en standard `L.marker` (blå pin). Denne typen markør **ignorerer** `renderer`- og `pane`-opsjoner og havner alltid i Leaflets innebygde `markerPane` (z-index 600) — under alle luftromslag.

### Løsning
Legge til `pointToLayer` i NOTAM `L.geoJSON`-kallet som konverterer Point-geometrier til en `L.marker` med eksplisitt `pane: 'notamPane'`. I tillegg sette `pointerEvents: 'auto'` på `notamPane` ved opprettelse (noen Leaflet-paner deaktiverer dette som standard for overlay-paner).

### Endringer

**1. `src/components/OpenAIPMap.tsx`** — Sett `pointerEvents` på notamPane

Etter pane-opprettelsen (linje ~366), legg til:
```ts
// Etter createPane-løkken:
map.getPane('notamPane')!.style.pointerEvents = 'auto';
```

**2. `src/lib/mapDataFetchers.ts`** — Legg til `pointToLayer` i L.geoJSON

I NOTAM GeoJSON-kallet (linje 876), legg til `pointToLayer` som returnerer en `L.marker` med custom DivIcon (orange NOTAM-pin) i `notamPane`:

```ts
const geoLayer = L.geoJSON(notam.geometry_geojson as any, {
  pane,
  renderer: notamRenderer,
  interactive: mode !== "routePlanning",
  bubblingMouseEvents: false,
  pointToLayer: (_feature, latlng) => {
    return L.marker(latlng, {
      pane,
      interactive: mode !== "routePlanning",
      bubblingMouseEvents: false,
      icon: L.divIcon({
        className: 'notam-pin-icon',
        html: '<div style="width:12px;height:12px;background:#f39c12;border:2px solid #e67e22;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>',
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      }),
    });
  },
  style: { ... },
} as any);
```

`L.marker` respekterer `pane`-opsjonen (til forskjell fra vektorer som trenger `renderer`), så markørene vil leve i `notamPane` (z-index 1000) og være klikkbare.

### Filer som endres
1. `src/components/OpenAIPMap.tsx` — 1 linje (pointerEvents)
2. `src/lib/mapDataFetchers.ts` — legg til `pointToLayer` i NOTAM GeoJSON-opsjoner

