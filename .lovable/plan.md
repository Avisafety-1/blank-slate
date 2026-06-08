# Plan: Diagnose blank 3D map (no new features, just debug)

The container CSS looks fine (`absolute inset-0` inside `flex-1 relative overflow-hidden`, same parent OpenAIPMap uses successfully), and `maplibre-gl.css` is imported at the top of `src/components/Map3D.tsx`. So the blank canvas is almost certainly a **runtime / tile / style** issue, not a sizing issue. We will prove this with logs and a minimal repro before changing anything else.

## Diagnostic changes to `src/components/Map3D.tsx`

Strip the component to a **bare-minimum MapLibre setup** with verbose logging. No terrain, no buildings, no AviSafe data sources/layers, no popups — just a basemap. Everything else is commented out (not deleted) so we can re-enable in steps.

### Step A — Minimal map + logging

Replace the init effect with:

```ts
console.log("[Map3D] mount, container =", containerRef.current,
  "size =", containerRef.current?.clientWidth, "x", containerRef.current?.clientHeight);

const map = new maplibregl.Map({
  container: containerRef.current!,
  style: {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap",
      },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#ff00ff" } }, // magenta = "style loaded but tiles failed"
      { id: "osm", type: "raster", source: "osm" },
    ],
  },
  center: [10.7522, 59.9139],
  zoom: 11,
});

map.on("load",   () => console.log("[Map3D] load OK"));
map.on("idle",   () => console.log("[Map3D] idle (first paint done)"));
map.on("error",  (e: any) => console.error("[Map3D] ERROR", e?.error?.message || e));
map.on("styledata", () => console.log("[Map3D] styledata"));
map.on("sourcedata", (e: any) => {
  if (e.sourceId === "osm" && e.isSourceLoaded) console.log("[Map3D] OSM tiles loaded");
});
```

Comment out (do not delete):
- `addOperationalLayers(map)` call
- All five data-fetching `useEffect` blocks (missions, NOTAMs, restriksjoner, SafeSky, FH2)
- Terrain / hillshade / sky / 3D buildings blocks
- The `pitch: 60` setting (set `pitch: 0`) to remove 3D as a variable

### Step B — Interpret the result

After approval, I'll ask you to open `/kart`, click "3D", and paste the console output. The result tells us exactly what's wrong:

| What you see | Root cause |
|---|---|
| Magenta background, no tiles, `ERROR` about CORS/403/blocked | OSM raster tiles blocked in Lovable iframe → switch to a tile source that works (MapTiler key, Stadia, or proxy) |
| Magenta background, no error, container size = `0 x 0` | Layout/sizing — fix parent `min-h-0` chain |
| Map shows OSM correctly | Base works → re-enable steps below one at a time |
| Nothing in console, no `load` event | Maplibre import / CSS issue |

### Step C — Re-enable in order (only after Step B passes)

Each step gated on the previous step working visually:

1. Terrain DEM + `setTerrain(...)` + hillshade. Verify with `pitch: 60`.
2. 3D buildings (OpenFreeMap vector source).
3. Operational layers (missions, NOTAM, restriksjoner, SafeSky, FH2) one source at a time.

## What I will NOT do in this round

- No new dependencies
- No changes to `Kart.tsx` (toggle, lazy loading stay as-is)
- No data fetching changes
- No new tile providers / API keys until Step B says we need one

## Deliverable from this plan

A console log dump that pinpoints the exact failing step. Then a follow-up plan (or direct fix in build mode) targeting only that cause.
