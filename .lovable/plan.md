

## Plan: Fix map rendering + Add visual DJI stick widget

### Problem 1: Map not rendering
The Leaflet map initializes inside a `Dialog` component. When the dialog opens, the map container div has no dimensions yet (CSS transition). Leaflet calculates tile positions based on a 0×0 container, resulting in grey/blank tiles. The fix is to call `map.invalidateSize()` after a short delay to let the dialog finish its open animation.

### Problem 2: RC stick visualization
Currently RC stick data (rcAileron, rcElevator, rcThrottle, rcRudder) is only shown as line charts. The user wants a visual representation of the two DJI controller sticks that animate in real-time as the scrubber moves.

### Changes

**`src/components/dashboard/FlightAnalysisDialog.tsx`**:
- After map initialization, add a `setTimeout(() => map.invalidateSize(), 300)` to recalculate tiles once the dialog animation completes
- Add a second `invalidateSize()` on a `ResizeObserver` attached to the map container for robustness

**`src/components/dashboard/FlightAnalysisTimeline.tsx`** (RC tab):
- Replace or augment the RC line chart tab with a **DualStickWidget** component
- The widget renders two square boxes side-by-side representing the left and right DJI controller sticks:
  - **Left stick**: Rudder (X-axis) + Throttle (Y-axis)
  - **Right stick**: Aileron (X-axis) + Elevator (Y-axis)
- Each box has a crosshair and a colored dot showing the current stick position
- Values are normalized from their range (typically -660 to 660 or -1 to 1) to pixel coordinates within the box
- The dot position updates reactively based on `currentIndex`
- Labels under each stick: "Venstre (Rudder/Throttle)" and "Høyre (Aileron/Elevator)"
- Keep the existing RC line chart below the sticks so users can see the historical trace too

**New component: `src/components/dashboard/StickWidget.tsx`**:
- A small reusable SVG component (~80×80px) that draws:
  - A square border with center crosshair lines
  - A filled circle at the normalized (x, y) position
  - Axis labels (optional)
- Props: `x: number`, `y: number`, `label: string`, `xLabel?: string`, `yLabel?: string`

### Visual design

```text
┌─────────────────────────────────────────┐
│  ┌──────────┐         ┌──────────┐      │
│  │     │     │         │     │     │      │
│  │─────●─────│         │─────┼──●──│      │
│  │     │     │         │     │     │      │
│  └──────────┘         └──────────┘      │
│   Venstre stikke       Høyre stikke      │
│  (Rudder / Throttle)  (Aileron / Elev.)  │
│                                          │
│  [existing RC line chart below]          │
└─────────────────────────────────────────┘
```

The dot (●) moves in real-time as the user scrubs through the timeline.

