

## Fix: Flight track data not loading on second map open

### Problem

When the expanded map dialog is closed and reopened, the flight track (the colored line showing the actual flown route) doesn't render. This happens due to a timing/race condition between three `useEffect` hooks:

1. **Cleanup effect** (line 333): When `open` becomes `false`, it sets `leafletMapRef.current = null` and clears all state.
2. **Map init effect** (line 166): When `open` becomes `true`, it starts map initialization with a 150ms delay (`setTimeout(tryInitMap, 150)`).
3. **Flight track rendering effect** (line 348): When `open` becomes `true`, it immediately checks `leafletMapRef.current` -- but this is still `null` because the map hasn't been created yet (150ms+ delay).

On second open, `flightTracks` is the same reference (unchanged from parent), and `terrainData` quickly restores from sessionStorage cache. But by the time the flight track effect runs, the Leaflet map instance doesn't exist yet, so the effect returns early and never renders the tracks.

### Solution

Add a `mapReady` state flag that is set to `true` after the Leaflet map is successfully created, and include it as a dependency in the flight track rendering effect. This ensures tracks are only rendered once the map actually exists.

### Changes

**File: `src/components/dashboard/ExpandedMapDialog.tsx`**

1. Add a new state variable `mapReady` (default `false`)
2. Set `mapReady = true` after the map is successfully created inside `tryInitMap` (after line 208)
3. Reset `mapReady = false` in the cleanup effect when dialog closes (after line 337)
4. Add `mapReady` as a dependency in the flight track rendering effect (line 462), replacing the check for `leafletMapRef.current` at line 349-350

### Technical details

```text
Current flow (broken on re-open):
  close -> cleanup (map=null, terrainData=[])
  open  -> map init starts (150ms delay)
        -> flight track effect runs immediately, map is null -> exits early
        -> terrain loads from cache -> flight track effect runs again, map still null -> exits early
        -> map finally created (too late, no re-trigger)

Fixed flow:
  close -> cleanup (map=null, mapReady=false, terrainData=[])
  open  -> map init starts (150ms delay)
        -> flight track effect runs, mapReady=false -> exits early
        -> map created, mapReady=true -> flight track effect re-triggers -> renders tracks
```

