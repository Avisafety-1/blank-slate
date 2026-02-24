

# Fix: `route.coordinates` is undefined in MissionMapPreview

## Problem

At line 98 in `MissionMapPreview.tsx`, the code checks `route && route.coordinates.length > 0`. This crashes when `route` is truthy (an object exists) but `route.coordinates` is `undefined`. This happens when a mission has a route object stored in the database without a `coordinates` array (e.g., an empty object `{}` or an object with only `soraSettings`).

## Fix

**File: `src/components/dashboard/MissionMapPreview.tsx`**

Add optional chaining on two lines where `route.coordinates` is accessed without a null check:

- **Line 98**: Change `route.coordinates.length` to `route?.coordinates?.length`
- **Line 105** (inside the SORA block): `route.coordinates` is already guarded by the `??` fallback, so it's fine
- **Line 113** (route polyline block): Same pattern — add `?.` guard

Specifically:
1. Line 98: `if (route && route.coordinates.length > 0)` → `if (route?.coordinates && route.coordinates.length > 0)`
2. Line 105 already uses `(route.coordinates ?? [])` which is safe
3. All other `route.coordinates` accesses inside the `if` block on line 98 are safe because the guard ensures it exists

This is a one-line fix with no side effects.

