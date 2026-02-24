

# Fix: `route.coordinates` is undefined in ExpandedMapDialog

## Problem

Same bug as MissionMapPreview -- `ExpandedMapDialog.tsx` accesses `route.coordinates.length` without checking if `coordinates` exists. When a mission has a route object without a `coordinates` array (e.g. `{}` or `{soraSettings: ...}`), lines 301, 304, 318, 320, and 569 all crash.

## Fix

**File: `src/components/dashboard/ExpandedMapDialog.tsx`**

Add optional chaining at the two guard points that protect all downstream access:

1. **Line 301**: `if (route && route.coordinates.length > 0)` → `if (route?.coordinates && route.coordinates.length > 0)`
2. **Line 569**: `{route && route.coordinates.length >= 3 && (` → `{route?.coordinates && route.coordinates.length >= 3 && (`

All other `route.coordinates` accesses (lines 304, 305, 318, 320) are inside the block guarded by line 301, so they become safe automatically.

Two-line fix, no side effects.

