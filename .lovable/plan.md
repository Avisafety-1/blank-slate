## Findings so far

- `maplibre-gl/dist/maplibre-gl.css` is imported in `src/components/Map3D.tsx`.
- The diagnostic `Map3D` component is mounted in the user screenshot because the label is visible.
- The browser/user console snapshot contains **no `[Map3D]` logs**.
- The network snapshot contains **no OSM tile requests**.
- Browser automation opened `/kart` but was redirected to login, so I cannot reproduce inside the browser without a preview login session.
- Because the diagnostic label renders but there are no MapLibre logs or tile requests, this is **not proven to be a WebGL failure yet**. A WebGL failure would normally produce a constructor error such as `Failed to initialize WebGL` / `webglcontextcreationerror` if the constructor runs.

## Most likely root cause

The likely failing step is before or during the `useEffect` that creates `new maplibregl.Map(...)`:

1. `Map3D` renders its JSX overlay.
2. The effect either does not run, is blocked by React development double-mount / auth/session overlay behavior, or the logs are not visible in the captured console snapshot.
3. Since no tile requests happen, MapLibre is not reaching normal style/tile loading.

WebGL remains possible, but we need a direct WebGL capability probe and constructor error capture to confirm it.

## Implementation plan

1. Add an on-screen diagnostic panel in `Map3D` instead of relying only on console logs.
   - Show container width/height.
   - Show whether `useEffect` ran.
   - Show MapLibre version.
   - Show WebGL1/WebGL2 availability via a small test canvas.
   - Show constructor success/failure.
   - Show `load`, `idle`, `error`, and OSM tile load events.

2. Wrap MapLibre initialization with stronger failure capture.
   - Catch constructor exceptions.
   - Listen for `webglcontextlost` and `webglcontextrestored` on the MapLibre canvas.
   - If WebGL is unavailable or constructor throws, display the exact message in the panel.

3. Keep the map in the current simplest setup.
   - Solid background.
   - One OSM raster layer.
   - No terrain.
   - No buildings.
   - No AviSafe layers.

4. Add a safe delayed `map.resize()` after mount.
   - This checks whether the white screen is caused by MapLibre initializing before the flex/absolute container has final dimensions.
   - Log/display dimensions before and after resize.

5. After the diagnostic panel identifies the failing step, stop and report the exact failing step before restoring terrain/buildings/AviSafe layers.

## What this changes

- Only `src/components/Map3D.tsx`.
- No database changes.
- No imports.
- No heavy queries.
- No terrain/building/AviSafe layers reintroduced yet.