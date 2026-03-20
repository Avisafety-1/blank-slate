

## Plan: Fix Batt.info tab visibility + warning click behavior

### Problem 1: Batt.info tab not showing
The `batteryInfo` tab (line 87) requires `temp` data to appear via the primary filter. The fallback (lines 97-100) checks for `voltage`/`current`, but this only works if the primary `batteryInfo` entry was filtered out AND voltage/current exists. The issue is likely that neither `temp`, `voltage`, nor `current` fields are populated in the telemetry points passed to the component.

**Fix:** Make the `batteryInfo` tab also check for `voltage` as a secondary key directly in the filter, instead of relying on the post-filter splice logic. Simplify to:

```typescript
{ id: "batteryInfo", label: "Batt.info", icon: Thermometer, 
  custom: true } // Always evaluate manually
```

Then in the filter, explicitly check: show batteryInfo if ANY of `temp`, `voltage`, `current`, `temp1`, `temp2` has data.

### Problem 2: Multiple warnings highlighted on click
When clicking a warning in the list, `onIndexChange(e.index)` sets `currentIndex`. The `isActive` check (`currentIndex === e.index`) then highlights ALL events that mapped to the same telemetry index (multiple events can share the same closest position).

**Fix:** Track a `selectedEventIndex` (the list index `i`, not the telemetry index) separately. Highlight based on list position, not telemetry position. Still call `onIndexChange` to move the map/timeline.

### File to modify
- `src/components/dashboard/FlightAnalysisTimeline.tsx`
  - Rework `availableTabs` to always include batteryInfo when voltage/current/temp/temp1/temp2 exists
  - Add `selectedEventIdx` state for warning list highlighting
  - Use `selectedEventIdx === i` instead of `currentIndex === e.index` for active state

