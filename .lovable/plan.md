

# Update Map Beacon Icons to SVG by Type

## Overview
Replace the current PNG-based aircraft icons (airplane-icon.png, helicopter-icon.png, drone-animated.gif) with proper SVG icons matching each SafeSky beacon type. Add animated rotor blades for helicopters by cycling through 4 SVG animation frames.

## Beacon Type to Icon Mapping

| Beacon Type | Icon File | Animation |
|---|---|---|
| UNKNOWN | dot.svg | None |
| STATIC_OBJECT | dot.svg | None |
| GLIDER | glider.svg | None |
| PARA_GLIDER | para_glider.svg (not provided -- fallback to dot.svg) | None |
| HAND_GLIDER | hand_glider.svg (not provided -- fallback to dot.svg) | None |
| PARA_MOTOR | para_motor.svg (not provided -- fallback to dot.svg) | None |
| PARACHUTE | parachute.svg (not provided -- fallback to dot.svg) | None |
| FLEX_WING_TRIKES | flex_wing_trikes.svg (not provided -- fallback to dot.svg) | None |
| THREE_AXES_LIGHT_PLANE | light_aircraft.svg | None |
| MOTORPLANE | aircraft.svg | None |
| JET | heavy_aircraft.svg | None |
| HELICOPTER | helicopter.svg | Cycle helicopter-anim_0 through _3 |
| GYROCOPTER | gyrocopter.svg (not provided -- fallback to helicopter.svg) | None |
| AIRSHIP | airship.svg (not provided -- fallback to dot.svg) | None |
| BALLOON | ballon.svg (not provided -- fallback to dot.svg) | None |
| UAV | uav.svg (not provided -- fallback to drone-animated.gif) | Existing GIF |
| PAV | pav.svg (not provided -- fallback to dot.svg) | None |
| MILITARY | military.svg (not provided -- fallback to aircraft.svg) | None |

Note: Only the SVGs the user uploaded are available. Missing types will use sensible fallbacks.

## Steps

### 1. Copy SVG assets into `src/assets/safesky-icons/`
Copy all uploaded SVG files:
- dot.svg, glider.svg, aircraft.svg, light_aircraft.svg, heavy_aircraft.svg
- helicopter.svg, helicopter-anim_0.svg, helicopter-anim_1.svg, helicopter-anim_2.svg, helicopter-anim_3.svg

### 2. Update OpenAIPMap.tsx -- imports
- Import all new SVG icons at the top of the file
- Remove the old `airplaneIcon` and `helicopterIcon` PNG imports (keep `droneAnimatedIcon` for UAV)

### 3. Update OpenAIPMap.tsx -- beacon type mapping
Create a helper function `getBeaconSvgUrl(beaconType: string)` that maps the SafeSky `beacon_type` string to the correct imported SVG URL. The beacon_type values from SafeSky are strings like "MOTORPLANE", "HELICOPTER", "UAV", etc.

### 4. Update OpenAIPMap.tsx -- helicopter animation
For HELICOPTER beacons:
- Store the 4 animation frame SVG URLs in an array
- On marker creation, start a `setInterval` (every 150-200ms) that cycles through the 4 frames by updating the `<img>` src
- Track intervals in a Map keyed by beacon ID
- Clear intervals when markers are removed
- Skip frame updates if the marker popup is open

### 5. Update marker rendering logic
In `renderSafeSkyBeacons()`:
- Replace the current `isDrone`/`isHelicopter`/else branching with the new `getBeaconSvgUrl()` lookup
- Keep the existing high-altitude filter (grayscale+brightness for >2000ft)
- Keep rotation via CSS transform for non-helicopter types
- Helicopters: no rotation, use animation cycling instead
- UAV: keep using existing drone-animated.gif
- All other types: use the SVG icon with heading rotation

### 6. Update existing marker updates
In the "existingMarker" branch, also update icon src if beacon type could change (unlikely but safe), and ensure helicopter animation intervals are properly managed.

## Technical Details

- SVG icons are imported as ES module URLs (Vite handles this)
- Helicopter animation: `setInterval` at ~200ms cycling through frames 0-3
- Animation intervals stored in a `Map<string, number>` alongside `safeskyMarkersCache`
- Cleanup: intervals cleared when markers are removed from cache or on component unmount
- Icon size: 32x32px for all types (consistent with current), 62x62 for UAV drones (keeping current size)

