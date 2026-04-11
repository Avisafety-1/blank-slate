

## Plan: Use 250m SSB Population Grid for Adjacent Area Calculation

### What changes

The adjacent area calculation currently uses the `befolkning_1km_2025` SSB layer (1 km² grid cells). We switch the WFS query to use `befolkning_250m_2025` (250m grid cells, ~62,500 m² each) for more precise density calculations near urban areas. The existing WMS map layer stays on 1km.

Since each 250m cell covers 1/16 of a 1km cell, the population values are already per-cell (not per km²), so the math remains the same: sum all population in the donut, divide by donut area in km².

### Files to modify

1. **`supabase/functions/ssb-population/index.ts`**
   - Change `typeNames=befolkning_1km_2025` → `typeNames=befolkning_250m_2025`
   - Increase `maxFeatures` from 10,000 to 50,000 (16x more cells possible)
   - Add a query param `resolution=250` so we can extend later

2. **`src/components/AdjacentAreaPanel.tsx`**
   - Add info text indicating the calculation uses 250m SSB grid resolution for improved accuracy
   - Example: "Beregningen bruker SSB 250m befolkningsrutenett for høyere presisjon."

3. **`src/lib/adjacentAreaCalculator.ts`**
   - No logic changes needed — the density math (total pop / area km²) works regardless of cell size

### Steps
1. Update edge function to query 250m layer, redeploy
2. Test the endpoint with curl to verify SSB returns data for the 250m layer
3. Add info text to the panel UI

