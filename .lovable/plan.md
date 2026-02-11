

## Fix: Airspace warnings must check the entire route, not just the start point

### Problem
The `check_mission_airspace` SQL function pre-filters candidate zones using `ST_DWithin(geometry::geography, v_point::geography, 50000)` where `v_point` is only the start coordinate (p_lat/p_lon). If an AIP zone (like R-107) is more than 50 km from the start point but directly intersected by the route, it is never evaluated.

The inner loop correctly iterates all route points, but the outer WHERE clause eliminates zones too far from the start before they reach the inner loop.

### Solution
Create a geometry that represents the full route extent, and use that for the `ST_DWithin` filter instead of just the start point.

**File: New SQL migration**

After building the `v_points` array, construct a convex hull (`v_envelope`) from all route points. Then replace all four `ST_DWithin(..., v_point::geography, 50000)` filters with `ST_DWithin(..., v_envelope::geography, 50000)`.

### Technical Detail

```text
-- After building v_points array, add:
v_envelope := ST_ConvexHull(ST_Collect(v_points));

-- Replace all 4 occurrences of:
WHERE ST_DWithin(geometry::geography, v_point::geography, 50000)
-- With:
WHERE ST_DWithin(geometry::geography, v_envelope::geography, 50000)
```

This applies to all four zone checks:
1. RPAS 5km zones (line 58)
2. CTR/TIZ zones (line 82)
3. NSM zones (line 117)
4. AIP restriction zones (line 143)

### Impact
- Routes passing through any airspace zone will trigger warnings regardless of where the start point is
- No change to warning severity logic or messages
- Slightly broader candidate set means marginally more zones evaluated, but the 50 km buffer already makes this negligible

