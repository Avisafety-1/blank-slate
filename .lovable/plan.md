

## Plan: Optimize Route Planner Toolbar for Mobile

### Problem
On mobile (390px wide), the route planning toolbar has too many buttons in a horizontal row, causing overflow. The buttons include: Pilot, Import KML, IPPC, Sensor, FH2, Undo, Clear, Cancel, Save — all in one line.

### Solution
Wrap the action buttons into multiple rows on mobile using `flex-wrap`, and make the info indicators (SafeSky area, VLOS) also wrap properly. Specifically:

### Changes to `src/pages/Kart.tsx`

1. **Action buttons container** (line ~451): Change from single-row flex to `flex flex-wrap` so buttons wrap to a second row on narrow screens instead of overflowing.

2. **Info section** (line ~388): Add `flex-wrap` so the SafeSky area badge and VLOS indicator wrap below the title on mobile instead of extending the row.

3. **Group the tool buttons more tightly**: Merge the middle groups (Pilot, KML, IPPC, Sensor, FH2) into one wrapping container, and keep Undo/Clear and Cancel/Save as compact icon-only groups on mobile.

4. **Reduce padding/gaps on mobile**: Use `gap-1` instead of `gap-1.5` on mobile for tighter spacing.

The key CSS changes:
- Outer actions div: `flex flex-wrap items-center gap-1 sm:gap-2`
- Remove the nested `<div>` groupings on mobile so all buttons can flow freely and wrap naturally
- Keep icon-only buttons on mobile (already done via `hidden sm:inline` on labels)

