

## Save and Display SORA Buffer Zones on Mission Cards

### Problem
When a route is saved with SORA operational volume enabled, the buffer zones (flight geography, contingency area, ground risk buffer) are not persisted with the mission data. The mission card map (`MissionMapPreview`) therefore cannot display these zones.

### Solution
Persist the SORA settings inside the `RouteData` object so they are saved to the database alongside the route. Then render the buffer zones in `MissionMapPreview` using the same convex hull + buffer algorithm.

### Changes

#### 1. `src/components/OpenAIPMap.tsx` -- Add `soraSettings` to `RouteData`
- Add an optional `soraSettings?: SoraSettings` field to the `RouteData` interface
- When reporting route changes via `onRouteChange`, include the current SORA settings if enabled

#### 2. `src/pages/Kart.tsx` -- Attach SORA settings to route before saving
- When `handleSaveRoute` is called, attach the current `soraSettings` to `currentRoute` before navigating (so it gets stored in the mission's `route` JSON column)

#### 3. `src/components/dashboard/MissionMapPreview.tsx` -- Render SORA zones
- Extract the `computeConvexHull` and `bufferPolygon` utility functions into a shared location (or duplicate the small functions inline in MissionMapPreview)
- When `route.soraSettings?.enabled` is true, compute and render the three concentric buffer zones (green flight geography, yellow contingency, red ground risk) on the preview map
- Use the same color scheme and opacity as the main map

### Technical Details

**Data flow:**
```text
Route planner (OpenAIPMap) 
  -> onRouteChange({ coordinates, totalDistance, areaKm2, soraSettings })
  -> Kart.tsx saves to currentRoute state
  -> handleSaveRoute navigates with routeData including soraSettings
  -> AddMissionDialog saves routeData (with soraSettings) to missions.route column (JSONB)
  -> MissionMapPreview reads route.soraSettings and renders zones
```

**Files changed:**
- `src/components/OpenAIPMap.tsx` -- add `soraSettings` to RouteData, include in onRouteChange callback
- `src/pages/Kart.tsx` -- ensure soraSettings is attached to currentRoute when saving
- `src/components/dashboard/MissionMapPreview.tsx` -- render SORA buffer zones from saved soraSettings

**Shared geometry functions** (`computeConvexHull`, `bufferPolygon`) will be duplicated in MissionMapPreview to keep it self-contained (they are ~80 lines of pure math with no dependencies).

