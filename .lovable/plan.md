

## SORA Operational Volume Visualization on Route Planner

### Overview
Add configurable SORA operational volume zones to the route planner on /kart. When a route is drawn, concentric buffer zones will be visualized around it with distinct colors and opacity, matching the SORA framework diagram.

### Visual Zones (inside-out)
1. **Flight Geography Area** (green, semi-transparent) -- the convex hull of the planned route
2. **Contingency Area** (yellow, semi-transparent) -- buffer around flight geography, user-configurable distance in meters
3. **Ground Risk Buffer** (red, semi-transparent) -- buffer outside contingency area, user-configurable width in meters

### User Controls
A collapsible settings panel in the route planning toolbar area with:
- **Flight altitude (m)** -- number input, max actual flight height (used for labeling/export, not visual on 2D map)
- **Contingency area (m)** -- slider/input for horizontal buffer distance (default: 10m)
- **Contingency volume height (m)** -- height above flight altitude (for labeling/export)
- **Ground risk buffer (m)** -- slider/input for outer buffer width (default: 20m)
- Toggle to show/hide the zones

### Implementation

#### 1. Buffer Polygon Generation (utility function)
Create a `bufferPolygon` helper that takes a set of convex hull points and a distance in meters, and returns an expanded polygon. This uses a simple offset approach:
- Convert the convex hull to a local coordinate system (meters)
- For each edge, compute an outward-offset parallel edge
- Intersect consecutive offset edges to get new vertices
- Convert back to lat/lng

This avoids adding a dependency like Turf.js by implementing a basic polygon buffer algorithm.

#### 2. OpenAIPMap.tsx -- New props and rendering
- Add new props: `soraSettings` (object with contingencyDistance, groundRiskDistance, flightAltitude, contingencyHeight, enabled)
- In `updateRouteDisplay`, after drawing the route polyline, render three concentric polygons on the `routePane`:
  - Green polygon (flight geography) -- convex hull of route points, `fillColor: '#22c55e'`, `fillOpacity: 0.2`
  - Yellow polygon (contingency area) -- buffered hull by contingencyDistance, `fillColor: '#eab308'`, `fillOpacity: 0.15`
  - Red polygon (ground risk buffer) -- buffered hull by contingencyDistance + groundRiskDistance, `fillColor: '#ef4444'`, `fillOpacity: 0.12`
- Polygons drawn in order: red first, yellow second, green last (so green is on top)

#### 3. Kart.tsx -- Settings panel UI
- Add state for SORA settings: `soraEnabled`, `contingencyDistance` (default 10), `groundRiskDistance` (default 20), `flightAltitude` (default 120), `contingencyHeight` (default 30)
- Add a collapsible panel (using Collapsible component) in the route planning controls bar
- Contains number inputs/sliders for each parameter
- Pass settings to OpenAIPMap as a prop
- Settings are also saved into the RouteData when saving the route (for potential later use in mission details)

### Technical Details

**Buffer algorithm:**
```text
For each edge of the convex hull:
  1. Compute normal vector (perpendicular, pointing outward)
  2. Offset both endpoints by distance along normal
  3. Intersect consecutive offset edges for new vertex
```

**Files changed:**
- `src/components/OpenAIPMap.tsx` -- new prop, buffer rendering in updateRouteDisplay
- `src/pages/Kart.tsx` -- SORA settings state, collapsible UI panel, pass props

**Color scheme:**
- Flight geography: `#22c55e` (green), fill opacity 0.2, stroke opacity 0.5
- Contingency area: `#eab308` (yellow), fill opacity 0.15, stroke opacity 0.4
- Ground risk buffer: `#ef4444` (red), fill opacity 0.12, stroke opacity 0.35
- All with dashed strokes for clarity

**No new dependencies required** -- pure geometry math for polygon buffering.

