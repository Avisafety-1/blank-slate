

## Plan: Adjacent Area as Buffered Polygon Instead of Circle

### What changes

Currently `renderAdjacentAreaZone` draws a simple `L.circle` from the route centroid. Instead, it should buffer the ground risk zone polygon outward by `adjacentRadiusM` minus the ground risk buffer distance, producing a shape that follows the contour of the SORA buffer zones.

### Approach

Reuse the existing `makeBuffer` pattern from `renderSoraZones`. The adjacent area is the ground risk buffer expanded outward by the adjacent area distance. So the total buffer from the route is `flightGeo + contingency + groundRisk + adjacentRadius`.

**Color**: Purple/violet (`#8b5cf6`) — distinct from green (flight geo), yellow (contingency), red (ground risk), and blue (already used for other map elements). Dashed outline, very light fill.

### Files to modify

**1. `src/lib/soraGeometry.ts`** — `renderAdjacentAreaZone`
- Add `sora: SoraSettings` parameter
- Use `makeBuffer` logic (same corridor/convexHull pattern) with total distance = `flightGeo + contingency + groundRisk + adjacentRadiusM`
- Render as `L.polygon` with purple styling (`#8b5cf6`, `fillOpacity: 0.05`, `dashArray: '10, 6'`)
- Remove the old `L.circle` approach

**2. `src/components/OpenAIPMap.tsx`** — call site
- Pass `soraSettings` to `renderAdjacentAreaZone` so it can compute the full buffer

**3. `src/lib/adjacentAreaCalculator.ts`** — population filtering
- Instead of filtering by haversine distance from centroid, the filtering should use a point-in-polygon approach for the adjacent area donut (between ground risk buffer polygon and adjacent area polygon). However, this is a more complex change. As a pragmatic first step, the current centroid-based filtering is a reasonable approximation and can remain unchanged for now, with a note for future improvement.

### Summary of visual result
The adjacent area will appear as a purple dashed polygon that follows the shape of the red ground risk buffer at a fixed offset, rather than a circle.

