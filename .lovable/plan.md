

## Problem Analysis

Two related issues:

1. **SafeSky beacons stop loading after long sessions**: The Supabase realtime channel can silently disconnect. The 5-second polling interval continues but may also fail silently if the Supabase client token expires or the connection degrades. There's no reconnection logic or health check.

2. **Leaflet `el._leaflet_pos` TypeError**: This occurs when markers are manipulated (setLatLng, animation intervals) after the map has been removed or during zoom transitions. The helicopter animation intervals run every 200ms and access `marker.getElement()` without checking if the marker is still attached to the map.

## Solution

### 1. SafeSky manager resilience (`src/lib/mapSafeSky.ts`)

- Add a `destroyed` flag set in `cleanup()` to prevent any operations after teardown
- Guard `fetchSafeSkyBeacons` and `renderSafeSkyBeacons` with the destroyed check
- Guard helicopter animation intervals: check `marker.getElement()` exists and that the marker's `_map` is still set before DOM manipulation
- Add error handling around `marker.setLatLng()` and `marker.addTo()` to catch Leaflet internal errors
- On fetch failure, log but don't crash; the poll will retry in 5 seconds
- In `stop()`, clear all helicopter animation intervals (currently only done in `cleanup()`)

### 2. Reconnection logic (`src/lib/mapSafeSky.ts`)

- Track consecutive fetch failures; after 3 failures, tear down and restart the realtime channel
- This handles stale Supabase connections during long sessions

### 3. Map-level guard (`src/components/OpenAIPMap.tsx`)

- No changes needed here; the fixes in the manager are sufficient

### Summary of changes

| File | Change |
|------|--------|
| `src/lib/mapSafeSky.ts` | Add `destroyed` flag, guard all marker DOM access with null/map checks, clear heli intervals in `stop()`, add reconnection after repeated failures |

