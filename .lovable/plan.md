## Problem

1. **Flyplasser-laget krever av/på-toggle for å fungere**: `caaFlyplasserLayer` (CAA dronesoner-polygonene rundt flyplasser) opprettes i `OpenAIPMap.tsx` men legges aldri til kartet ved init. Bare `airportsLayer` (ikon-markørene) får `.addTo(map)`. Når `fetchCaaLayers()` kjører første gang, sjekker den `map.hasLayer(caaFlyplasserLayer)` → false → hopper over henting. Først når brukeren togler av og på får laget `addTo(map)` via `handleLayerToggle`, og neste `moveend` (eller umiddelbar fetch i toggle) henter polygonene.

2. **Polygonfarge for flyplasser**: I `src/lib/mapDataFetchers.ts` står `flyplasser: { color: '#eab308' }` (gul). Brukeren vil ha rød med opacity for bedre synlighet.

## Endringer

### `src/components/OpenAIPMap.tsx` (rundt linje 672)
Legg `caaFlyplasserLayer` til kartet ved init, slik at den initielle `fetchCaaLayers()`-kallet faktisk henter polygonene:

```ts
const caaFlyplasserLayer = L.layerGroup().addTo(map);
```

Default-toggle (`enabled: true`) i layer-config beholdes uendret på linje 766.

### `src/lib/mapDataFetchers.ts` (linje 944)
Endre farge for flyplasser-polygonet til rød:

```ts
flyplasser: { color: '#dc2626', iconLabel: '✈️ Flyplass' },
```

`fillOpacity` styres allerede dynamisk (0.22 for `REQ_AUTHORISATION`, ellers 0.12) og trenger ikke endres — rødfargen vil være synlig med samme opacity-skjema som andre soner.

## Resultat

- Flyplass-polygoner vises umiddelbart ved kartlasting uten manuell toggle.
- Polygonene rundt små-/helikopterplasser tegnes i rødt med eksisterende lett gjennomsiktighet, klart skilt fra gule fareområder.