

## Plan: Align Population Calculation with Polygon Geometry

### Problem
The population density calculation in `adjacentAreaCalculator.ts` still uses the old circle-based approach: it computes a centroid, then filters SSB cells by haversine distance from that centroid (lines 210-226). For long routes, the actual adjacent area is an elongated corridor-shaped polygon (as now drawn on the map), but the calculation uses a circular donut that misses cells along the route's length.

The area calculation (lines 228-231) also uses circular `π·r²` formulas instead of the actual polygon area.

### Solution
Reuse the same buffered polygon geometry from `soraGeometry.ts` to do point-in-polygon filtering of SSB cells, and compute the actual polygon area.

### Changes

**1. `src/lib/adjacentAreaCalculator.ts`**
- Import `bufferPolyline`, `bufferPolygon`, `computeConvexHull` from `soraGeometry.ts` and `mapGeometry.ts`
- Replace `outerBufferRadius` / `adjacentBbox` / haversine-circle filtering with:
  - Build inner polygon (ground risk buffer) using same logic as `renderAdjacentAreaZone`
  - Build outer polygon (adjacent area) using same logic
  - Compute bounding box from the outer polygon vertices (not from centroid + radius)
  - Filter SSB cells using point-in-polygon: cell is in adjacent area if it's **inside outer polygon AND outside inner polygon**
- Replace circular area formula with actual polygon area using shoelace formula (import `calculatePolygonAreaKm2` from `mapGeometry.ts` or compute inline)
- Add a simple ray-casting point-in-polygon helper function

**2. `src/lib/soraGeometry.ts`**
- Export `bufferPolygon` helper (if not already exported) so the calculator can reuse it

### Implementation detail
```
// Pseudocode for new filtering logic:
const innerPoly = makeBuffer(coords, sora, fgDist + cDist + grDist);
const outerPoly = makeBuffer(coords, sora, fgDist + cDist + grDist + adjacentRadiusM);
const bbox = bboxFromPolygon(outerPoly);
const cells = await fetchSsbPopulationGrid(bbox, signal);

for (cell of cells) {
  if (pointInPolygon(cell, outerPoly) && !pointInPolygon(cell, innerPoly)) {
    totalPop += cell.population;
  }
}

const adjacentAreaKm2 = polygonAreaKm2(outerPoly) - polygonAreaKm2(innerPoly);
```

This ensures the population calculation matches the purple polygon shown on the map exactly.

