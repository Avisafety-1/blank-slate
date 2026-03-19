

## Fix: FlightAnalysisDialog crash

### Problem
The `FlightAnalysisDialog` uses `react-leaflet` components (`MapContainer`, `TileLayer`, `Polyline`, `Marker`, etc.) but the rest of the project uses **vanilla Leaflet** (`L.map()`, `L.tileLayer()`, etc.). The react-leaflet v5 components are crashing with a React context error: `render2 is not a function`.

### Root cause
react-leaflet v5 has compatibility issues with the project's React setup. No other component in the project uses react-leaflet — they all use vanilla Leaflet directly (see `OpenAIPMap.tsx`, `LocationPickerDialog.tsx`).

### Solution
Rewrite the map section in `FlightAnalysisDialog.tsx` to use **vanilla Leaflet** (matching existing project patterns), removing the react-leaflet dependency entirely.

### Changes

**`src/components/dashboard/FlightAnalysisDialog.tsx`**:
- Replace `MapContainer`, `TileLayer`, `Polyline`, `CircleMarker`, `Marker`, `useMap` imports with vanilla Leaflet
- Use a `ref` for the map container div and initialize with `L.map()` (same pattern as `LocationPickerDialog.tsx`)
- Manage polylines, markers, and the drone position marker via `useEffect` hooks that react to `currentIndex` changes
- Remove the `MapUpdater` component (replaced by direct `map.panTo()` calls)

No other files need changes.

