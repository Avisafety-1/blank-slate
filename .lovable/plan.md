

## Plan: Merge duplicate battery tabs and fix crash

### Problem
1. **Crash on "Batteri" tab**: The `MiniChart` component wraps children in Recharts `LineChart`, which doesn't accept React fragments (`<>...</>`) as children. Lines 215-227 use conditional fragments with `isDualBattery`, causing `Invariant failed` error.
2. **Duplicate tabs**: "Batteri" shows battery % + voltage graphs, "Batt.info" shows temp/current/voltage graphs + summary stats. These overlap (both show voltage) and should be merged into one tab.

### Fix

**File: `src/components/dashboard/FlightAnalysisTimeline.tsx`**

1. **Remove the separate "battery" tab** from `availableTabs` (line 89). Keep only "batteryInfo" but rename it to "Batteri".

2. **Merge content**: Move the battery % chart (currently in the "battery" `TabsContent`) into the "batteryInfo" `TabsContent` as the first chart, above the existing temp/current/voltage charts. Add a label "Batteri %" like the other sub-charts have.

3. **Fix fragment issue**: Instead of wrapping Lines in fragments, render them as flat conditional children — each `<Line>` rendered individually with conditional logic, no fragments.

4. **Update the tab filter**: The batteryInfo tab should also appear when `battery` or `battery1` data exists (not just temp/voltage/current).

5. **Remove the now-unused "battery" `TabsContent`** block (lines 213-229).

### Result
- One "Batteri" tab with: summary stats (cycles, health, etc.) + battery % graph + temperature graph + current graph + voltage graph
- No more crash from fragment children in Recharts
- No duplicate/confusing tabs

