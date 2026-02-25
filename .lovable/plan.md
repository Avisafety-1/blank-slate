

# Refaktorering av OpenAIPMap.tsx (2401 linjer)

## Analyse av filen

| Blokk | Linjer | Beskrivelse |
|---|---|---|
| Imports + constants | 1-68 | SafeSky-ikoner, typer, constants |
| Types/interfaces | 65-104 | `RoutePoint`, `RouteData`, `SoraSettings`, `OpenAIPMapProps` |
| Geometri-funksjoner | 106-267 | `calculateDistance`, `computeConvexHull`, `bufferPolygon`, `calculatePolygonAreaKm2` |
| Komponent start + refs | 269-308 | ~40 refs og state-variabler |
| `setGeoJsonInteractivity` | 313-339 | Utility callback |
| `switchBaseLayer` | 341-371 | Base layer bytte |
| Ref-sync useEffects | 374-392 | 5 korte useEffects |
| `updateRouteDisplay` | 396-543 | **~150 linjer** -- rute-tegning + SORA-zones |
| Mode/route sync effects | 545-609 | 3 useEffects |
| Hoved-useEffect (kartet) | 611-2113 | **~1500 linjer** -- ALT i en useEffect |
| Post-init effects | 2115-2244 | initialCenter, existingRoute, focusFlightId, pilotPosition |
| `handleLayerToggle` | 2246-2275 | Layer toggle handler |
| `clearRoute` + `undoLastPoint` | 2278-2302 | Route utilities |
| JSX return | 2304-2401 | ~100 linjer UI |

**Kjerneproblemet**: En eneste `useEffect` pa 1500 linjer (linje 611-2113) som initialiserer kartet og inneholder ~15 async-funksjoner for datahenting.

## Refaktoreringsplan -- 5 steg

Rekkefølge: rene utility-funksjoner forst, deretter data-fetchers, til slutt selve komponenten.

---

### Steg 1: Flytt geometri-funksjoner og typer

**Nye filer:**

| Fil | Innhold | Fra linjer |
|---|---|---|
| `src/lib/mapGeometry.ts` | `calculateDistance`, `calculateTotalDistance`, `computeConvexHull`, `bufferPolygon`, `intersectLines`, `calculatePolygonAreaKm2` | 106-267 |
| `src/lib/mapIcons.ts` | `getBeaconSvgUrl`, `isAnimatedType`, `HELI_ANIM_FRAMES`, SafeSky icon imports | 14-56 |

Typene `RoutePoint`, `RouteData`, `SoraSettings` eksporteres allerede fra denne filen og brukes andre steder. De flyttes til `src/types/map.ts` eller beholdes som re-export.

---

### Steg 2: Flytt data-fetching-funksjoner ut av useEffect

Alle async-funksjoner inne i den store useEffect er selvstendige og tar bare map-layers + supabase som avhengigheter. De kan flyttes til:

**Ny fil:**

| Fil | Innhold | Fra linjer |
|---|---|---|
| `src/lib/mapDataFetchers.ts` | `fetchNsmData`, `fetchRpasData`, `fetchAipRestrictionZones`, `fetchRmzTmzAtzZones`, `fetchObstacles`, `fetchAirportsData`, `fetchAndDisplayMissions`, `fetchDroneTelemetry`, `fetchActiveAdvisories`, `fetchPilotPositions` | 906-1668 |

Hver funksjon tar et parameter-objekt med de layers/refs den trenger:

```text
export async function fetchNsmData(params: {
  nsmLayer: L.LayerGroup;
  mode: string;
  nsmGeoJsonRef: React.MutableRefObject<...>;
  setGeoJsonInteractivity: (...) => void;
}) { ... }
```

---

### Steg 3: Flytt SafeSky-rendering

**Ny fil:**

| Fil | Innhold | Fra linjer |
|---|---|---|
| `src/lib/mapSafeSky.ts` | `renderSafeSkyBeacons`, `fetchSafeSkyBeacons`, `startSafeSkySubscription`, `stopSafeSkySubscription` | 960-2078 |

Denne blokken er ~120 linjer og har sin egen marker-cache og animasjonslogikk.

---

### Steg 4: Flytt layer-initialisering

**Ny fil:**

| Fil | Innhold | Fra linjer |
|---|---|---|
| `src/lib/mapLayerSetup.ts` | `createMapPanes`, `createBaseLayers` (OSM, NRL, Naturvern, SSB Arealbruk, Befolkning, RPAS, NSM, AIP, RMZ, Obstacles, Airports, Drones, Missions, SafeSky, Route, Pilot, Advisory) | 618-902 |

Returnerer en `LayerConfig[]` og alle layer-referanser.

---

### Steg 5: Flytt vær-popup logikk

**Ny fil:**

| Fil | Innhold | Fra linjer |
|---|---|---|
| `src/lib/mapWeatherPopup.ts` | Hele vær-popup HTML-generering og click-handler | 1703-1960 |

Dette er ~260 linjer med ren HTML-strengbygging som er helt selvstendig.

---

## Resultat etter refaktorering

```text
src/
  components/
    OpenAIPMap.tsx               (~400 linjer: refs, useEffects, JSX)
  lib/
    mapGeometry.ts               (~170 linjer)
    mapIcons.ts                  (~50 linjer)
    mapDataFetchers.ts           (~500 linjer)
    mapSafeSky.ts                (~120 linjer)
    mapLayerSetup.ts             (~280 linjer)
    mapWeatherPopup.ts           (~260 linjer)
  types/
    map.ts                       (~30 linjer: RoutePoint, RouteData, SoraSettings)
```

`OpenAIPMap.tsx` gar fra **2401 linjer til ~400 linjer**. Totalt 7 filer istedenfor 1.

## Risiko og avbotende tiltak

- Geometri-funksjoner (steg 1) er null-risiko -- rene pure functions
- Data-fetchers (steg 2) krever at parameter-objektene er korrekt typet, men funksjonene endres ikke
- Layer-setup (steg 4) er hoyest risiko fordi den toucher kartinitialisering -- testes grundig
- SafeSky (steg 3) har sin egen lifecycle (intervals, subscriptions) som ma overlevere flytten
- Typer som `RouteData` og `SoraSettings` brukes i mange andre filer -- re-exports sikrer bakoverkompatibilitet

