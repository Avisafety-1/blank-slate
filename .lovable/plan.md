# Plan: Robusthet for 3D-kartet (Map3D.tsx)

Mål: gjøre 3D-kartet motstandsdyktig mot WebGL context loss og rydde opp i alle lag/event/timer/marker-registreringer som Map3D selv eier. **Ingen funksjonelle endringer** i ruteplanlegging, SORA-geometri eller datalagring.

Alt skjer i `src/components/Map3D.tsx`. Sentry-kall gjenbruker `@/lib/sentry`.

**Viktig restriksjon:** terrain-source og hillshade-lag som MapLibre setter opp via `buildStyle()` skal IKKE røres i cleanup. Vi rydder kun det Map3D selv har lagt til via `addLayer`/`addSource`.

---

## Prioritert rekkefølge

### 1. WebGL context-loss/restored overlay  (HØY)

I init-`useEffect` (rundt linje 877, etter `addControl`):

- Hent canvas: `const canvas = map.getCanvas()`
- Registrer:
  - `canvas.addEventListener('webglcontextlost', onLost, false)`
  - `canvas.addEventListener('webglcontextrestored', onRestored, false)`
- `onLost(e)`:
  - `e.preventDefault()`
  - `setContextLost(true)`
  - Stopp aktive timere: `safeskyPollRef`, `fetchTimerRef`, `soraTerrainDebounceRef`, `routeOverlayFrameRef` (clear/cancel, sett til null).
  - `Sentry.captureMessage('Map3D: WebGL context lost', { level: 'warning', tags: { component: 'Map3D' } })`
- `onRestored()`:
  - `Sentry.addBreadcrumb({ category: 'map3d', message: 'webgl context restored' })`
  - Gjenoppta `safeskyPollRef` (samme 10s-intervall).
  - `map.triggerRepaint()` og re-fetch: `refreshZones()`, `applyAipData()`, `applyRpasData()`, `refreshSafeSky()`.
  - `setContextLost(false)`.

Overlay i render:

```tsx
{contextLost && (
  <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-background/85 backdrop-blur-sm">
    <div className="rounded-lg border bg-card p-6 text-center shadow-lg max-w-sm">
      <AlertTriangle className="mx-auto h-8 w-8 text-amber-500 mb-2" />
      <h3 className="font-semibold mb-1">3D-kartet mistet GPU-kontekst</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Kan skje ved lite minne eller mange åpne faner. Forsøker å gjenopprette automatisk.
      </p>
      <Button onClick={() => window.location.reload()}>Last kart på nytt</Button>
    </div>
  </div>
)}
```

Hvis `onRestored` skyter, skjules overlay automatisk via `setContextLost(false)`.

### 2. Cleanup av lag/sources Map3D eier  (HØY)

Kun lag/sources lagt til av Map3D fjernes. **Ikke** rør `terrain` source eller `hillshade` lag — disse eies av `buildStyle()`/MapLibre.

Map3D-eide ID-er (samlet til konstanter øverst i fil for vedlikehold):

- **Zone-lag:** `zones-fill`, `zones-extrusion`, `zones-outline`, `zones-point` + source `zones`
- **AIP-lag:** `aip-fill`, `aip-extrusion`, `aip-outline` + source `aip`
- **RPAS-lag:** `rpas-fill`, `rpas-extrusion`, `rpas-outline` + source `rpas`
- **SafeSky:** `safesky-beacons`, `safesky-3d-models` (custom layer) + source `safesky`
- **Route planning (RP_*):** håndteres allerede av `removeRoutePlanningLayers`

Lag helper:

```ts
const OWNED_LAYER_IDS = [
  "zones-fill", "zones-extrusion", "zones-outline", "zones-point",
  "aip-fill", "aip-extrusion", "aip-outline",
  "rpas-fill", "rpas-extrusion", "rpas-outline",
  "safesky-3d-models", "safesky-beacons",
];
const OWNED_SOURCE_IDS = ["zones", "aip", "rpas", "safesky"];

const removeOwnedLayersAndSources = (map: MlMap) => {
  OWNED_LAYER_IDS.forEach(id => { try { if (map.getLayer(id)) map.removeLayer(id); } catch {} });
  try { safeskyModelLayerRef.current?.destroy(); } catch {}
  safeskyModelLayerRef.current = null;
  OWNED_SOURCE_IDS.forEach(id => { try { if (map.getSource(id)) map.removeSource(id); } catch {} });
};
```

Brukes i init-cleanup (før `map.remove()`) og kan gjenbrukes i toggle-extrude-effekten (linje 990-1021) for å erstatte hardkodet liste.

### 3. Cleanup av klikk-handlers (clickHandlersRef)  (HØY)

I dag er `installClickHandlers` lukket — handlere kan ikke fjernes individuelt. Endre slik:

```ts
type ClickReg = { event: string; layerId: string; fn: (e: any) => void };
const clickHandlersRef = useRef<ClickReg[]>([]);

const registerLayerHandler = (map: MlMap, event: string, layerId: string, fn: (e: any) => void) => {
  map.on(event as any, layerId, fn);
  clickHandlersRef.current.push({ event, layerId, fn });
};

const removeManagedClickHandlers = (map: MlMap) => {
  clickHandlersRef.current.forEach(({ event, layerId, fn }) => {
    try { map.off(event as any, layerId, fn); } catch {}
  });
  clickHandlersRef.current = [];
};
```

I `installClickHandlers` (linje 650-729): bytt alle `map.on("click"|"mouseenter"|"mouseleave", layerId, fn)` til `registerLayerHandler(map, ...)`.

Kall `removeManagedClickHandlers(map)`:
- Først i `installClickHandlers` (defensiv tom-rydding)
- I init-cleanup, før `map.remove()`
- I setStyle-effekten (linje 955) før `map.setStyle(...)` — så de gamle handlerne ikke henger igjen når nye registreres etter style-load.
- I toggle-extrude-effekten (linje 990) før re-install.

### 4. Cleanup av timers/rAF og event listeners  (HØY)

Init-cleanup (linje 936-950) dekker det meste allerede. Sjekk og fyll inn:

- ✅ `fetchTimerRef`, `safeskyPollRef`, `soraTerrainDebounceRef`, `routeOverlayFrameRef`, `t` (resize-timer)
- ✅ `map.off("move", handleRouteOverlayUpdate)`, `map.off("render", handleRouteOverlayUpdate)`
- ➕ Legg til: `map.off("load", onLoad)`, `map.off("moveend", debouncedRefresh)`, `map.off("moveend", emitView)`, `map.off("zoomend", emitView)`, `map.off("styleimagemissing", onStyleImgMissing)` — gjør alle handlere til navngitte funksjoner i useEffect-scope.
- ➕ `canvas.removeEventListener('webglcontextlost'/'webglcontextrestored', ...)`
- ➕ `removeManagedClickHandlers(map)` før `map.remove()`
- ➕ `removeRoutePlanningLayers(map)` før `map.remove()` (defensiv; `map.remove()` river uansett ned alt, men gjør cleanup eksplisitt for tilfellet der vi prøver å unngå GPU-leak)

Wrap init-feilen (linje 872-875) med `Sentry.captureException(err, { tags: { component: 'Map3D', phase: 'init' } })` i tillegg til `console.error`.

### 5. Unngå duplikate handlere ved styledata/style.load  (HØY)

To trigger-veier finnes:

**a) Eksplisitt setStyle** (linje 955-987, ved base-bytte):
```
removeManagedClickHandlers(map);  // ← nytt, før setStyle
safeskyModelLayerRef.current?.destroy();
map.setStyle(buildStyle(base));
map.once("idle", () => {
  addZoneLayers(...); addAipLayers(...); addRpasLayers(...);
  if (routePlanning) addRoutePlanningLayers(map);
  addSafeSkyLayer(map);
  installClickHandlers(map);  // pusher inn nye i clickHandlersRef
  ...
});
```

**b) styledata-effekten for route planning** (linje 1753-1766):
Allerede idempotent fordi `addRoutePlanningLayers` sjekker `if (!map.getSource(...))`. Beholdes uendret.

`installClickHandlers` kaller defensiv `removeManagedClickHandlers(map)` først, så selv om den (mot formodning) trigges to ganger, blir det ikke duplikater.

---

## Ikke berørt

- `useRoutePlanner`, ruteplanlegging-logikk, SORA-buffer/geometri
- DB-skriving, RPC, edge functions
- 2D-kartet (`MapView`)
- terrain-source/hillshade — MapLibre eier disse via `buildStyle()`
- Popups (transient, fjernes når kartet renderes på nytt eller bruker klikker X)

## Berørt fil

Kun `src/components/Map3D.tsx`.

## Verifisering

1. Build passerer (auto).
2. Naviger inn/ut av `/kart` 5+ ganger → ingen "too many active WebGL contexts" i konsoll.
3. Bytt grunnkart (satellitt ↔ topo ↔ standard) flere ganger → klikk en sone → kun én popup (ikke 2-3).
4. DevTools → `Rendering > GPU process > Crash GPU process` (eller `WEBGL_lose_context.loseContext()` fra konsoll) → overlay vises → restored-event gjenoppretter kartet automatisk, ellers fungerer "Last kart på nytt".
5. Sentry: bekreft at "Map3D: WebGL context lost" dukker opp som warning.
