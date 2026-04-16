

## Wind Arrow Indicator on Flight Analysis Map

### What We're Building
A compact wind indicator overlay on the top-left of the flight analysis map showing an arrow pointing in the wind direction with speed in m/s. Updates as the user scrubs through the timeline.

### Changes

**1. Edge Function: Add `WEATHER.maxWindSpeed [m/s]` to API fields**
- File: `supabase/functions/process-dronelog/index.ts`
- Add `"WEATHER.maxWindSpeed [m/s]"` to the FIELDS constant
- Parse it alongside existing wind fields and store as `maxWindSpeed` on each position point
- Handle `WEATHER.windDirection` potentially returning cardinal strings (N, S, SE, NW) — add a cardinal-to-degrees converter, fall back to `parseFloat` if already numeric
- Deploy the updated function

**2. Flight Analysis Dialog: Wind arrow overlay**
- File: `src/components/dashboard/FlightAnalysisDialog.tsx`
- Add a wind indicator widget in the top-left overlay area (alongside speed trail and warnings buttons)
- Shows when the current position has `windSpeed` or `windDir` data
- Visual: A small rounded card with a rotated arrow SVG (pointing in wind direction) and speed text like "4.2 m/s"
- Arrow rotation: CSS `rotate(Xdeg)` where X = windDir (meteorological convention: direction wind blows FROM, so arrow points downwind)

**3. TelemetryPoint type update**
- File: `src/components/dashboard/FlightAnalysisTimeline.tsx`
- Add `maxWindSpeed?: number` to the TelemetryPoint interface (optional, for future chart use)

### Wind Arrow Design
```text
┌──────────────┐
│   ↓  4.2 m/s │  (arrow rotates with windDir)
│   NW         │  (cardinal label)
└──────────────┘
```
Small glassmorphism card (~80x40px), positioned below the speed/warning buttons in the top-left stack. The arrow is an SVG that rotates based on `windDir`. Cardinal direction derived from degrees for display.

### Cardinal Direction Handling
Since `WEATHER.windDirection` may return "N", "NE", "SE" etc. instead of degrees, the parser will:
- Try `parseFloat` first — if numeric, use as-is
- If not numeric, map cardinal to degrees (N=0, NE=45, E=90, etc.)
- Store as numeric degrees in the position data

