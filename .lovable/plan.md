

## Plan: Persist Adjacent Area Toggle & Fix Overlapping Lines

### Problem 1: Toggle resets when panel closes
The `showOnMap` state is local to `AdjacentAreaPanel` and the effect on line 77 sends `false` when `open` becomes `false` (panel collapsed). So closing the collapsible hides the adjacent area.

**Fix**: Remove the dependency on `open` from the `onShowAdjacentArea` callback. Only send `showOnMap` state. The adjacent area should remain visible regardless of whether the panel is open or closed.

### Problem 2: Overlapping polygon lines on out-and-back routes
When a route goes A→B→A, the corridor buffer produces overlapping polygons (two parallel corridors stacked). The adjacent area polygon draws all these intermediate lines.

**Fix**: In `renderAdjacentAreaZone`, compute the convex hull of the buffered polygon before rendering. This collapses overlapping corridor shapes into a single outer boundary. Use the existing `computeConvexHull` function on the output of `makeAdjacentBuffer` to get only the outermost contour.

### Files to modify

**1. `src/components/AdjacentAreaPanel.tsx`**
- Line 77: Change `onShowAdjacentArea?.(showOnMap && open)` → `onShowAdjacentArea?.(showOnMap)`
- This keeps the map visualization active even when the panel is collapsed

**2. `src/lib/soraGeometry.ts`** — `renderAdjacentAreaZone`
- After computing `adjacentZone` (line 370), apply `computeConvexHull` to get only the outer boundary
- This eliminates internal overlapping lines from out-and-back routes

