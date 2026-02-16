

## Show SORA Zones and Settings Panel in Expanded Mission Map

### Problem
When opening the expanded map from a mission card on `/oppdrag`, the SORA buffer zones are not rendered even though they are saved in the route data. The SORA settings panel is also not available in this view.

### Solution
Update `ExpandedMapDialog` to:
1. Accept and render SORA zones from saved route data
2. Include the `SoraSettingsPanel` so users can view/adjust the SORA parameters
3. Re-render zones when settings change

### Changes

#### 1. `src/components/dashboard/ExpandedMapDialog.tsx`
- Add `SoraSettings` to the `RouteData` interface (matching `MissionMapPreview`)
- Import and reuse the SORA geometry utilities (`computeConvexHull`, `bufferPolygon`, `renderSoraZones`) -- extract them from `MissionMapPreview` into a shared utility, or duplicate inline
- Render SORA zones on the map during initialization when `route.soraSettings?.enabled` is true
- Add the `SoraSettingsPanel` component below the map header, initialized with the route's saved SORA settings
- When the user changes SORA settings in the panel, re-render the zones on the map in real-time (clear and redraw the SORA layer group)

#### 2. `src/components/dashboard/MissionDetailDialog.tsx`
- Pass the full `route` object (which already contains `soraSettings`) to `ExpandedMapDialog` -- verify this is already happening (it is, via `currentMission.route`)

### Technical Details

**SORA zone rendering in ExpandedMapDialog:**
- A dedicated `soraLayerRef` (`L.LayerGroup`) will hold the SORA polygons
- On settings change, the layer is cleared and zones are redrawn with updated distances
- The same `computeConvexHull` + `bufferPolygon` math from `MissionMapPreview` will be reused
- The `SoraSettingsPanel` will be placed between the dialog header and the map, matching the existing collapsible UX

**State flow:**
```
route.soraSettings (from DB)
  -> Initialize local soraSettings state in ExpandedMapDialog
  -> Pass to SoraSettingsPanel for display/editing
  -> On change: update local state -> re-render zones on map
```

**Files to modify:**
- `src/components/dashboard/ExpandedMapDialog.tsx` -- add SoraSettings interface, SORA geometry utils, SoraSettingsPanel integration, and zone rendering logic
- No other files need changes (route data already flows correctly from MissionDetailDialog)
