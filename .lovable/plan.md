
## Save SORA Zones from Map to Existing Missions

### Problem
Currently, when route planning is started directly from `/kart`, the "Lagre" button always navigates to `/oppdrag` to create a **new** mission. There is no way to save a route (with SORA zones) directly to an **existing** mission from the map.

### Solution
Add the ability to save a planned route with SORA settings directly to an existing mission from the map. This involves two changes:

1. **When clicking a mission marker on the map in view mode**, add a "Rediger rute" (Edit route) button in the mission popup/click handler that enters route planning mode for that specific mission, loading its existing route.

2. **When saving a route in route planning mode linked to an existing mission**, update the mission's `route` JSONB column directly in Supabase (instead of navigating away), then show a success toast and exit route planning mode.

### Changes

#### 1. `src/pages/Kart.tsx`
- Add a new state `editingMissionId` to track when route planning is for an existing mission
- Modify `handleMissionClick`: instead of only opening `MissionDetailDialog`, also offer a way to enter route planning for that mission (load its existing route and SORA settings into the planner)
- Add a new function `handleEditMissionRoute(mission)` that:
  - Sets `isRoutePlanning = true`
  - Loads the mission's existing route into `currentRoute`
  - Loads existing SORA settings into `soraSettings`
  - Stores the `editingMissionId`
- Modify `handleSaveRoute`:
  - If `editingMissionId` is set, perform a direct Supabase `update` on `missions.route` with the new route data (including SORA settings), show a toast, and exit route planning mode
  - Otherwise, use the existing navigation flow

#### 2. `src/components/dashboard/MissionDetailDialog.tsx`
- Add an "Rediger rute" button that navigates to `/kart` with the mission's route data and mission ID, entering route planning mode for that mission

### Technical Details

**Save flow for existing mission from map:**
```
User clicks mission marker on map
  -> MissionDetailDialog opens with "Rediger rute" button
  -> Click navigates to /kart with route planning state (missionId, existing route, SORA settings)
  -> User edits route / adjusts SORA zones
  -> Click "Lagre"
  -> Direct Supabase update: missions.route = routeToSave WHERE id = missionId
  -> Toast: "Rute oppdatert"
  -> Exit route planning mode, stay on /kart
```

**Files to modify:**
- `src/pages/Kart.tsx` -- add `editingMissionId` state, direct Supabase save logic in `handleSaveRoute`
- `src/components/dashboard/MissionDetailDialog.tsx` -- add "Rediger rute" button that navigates to `/kart` in route planning mode with mission data

**No database changes needed** -- the `missions.route` column is already JSONB and already stores `soraSettings` as part of the route object.
