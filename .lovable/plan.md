## Advanced Flight Log Analysis — Implemented

### What was done

1. **Expanded API fields in all 3 edge functions** (`process-dronelog`, `dji-process-single`, `dji-auto-sync`):
   - Added ~24 new fields: RC inputs (aileron, elevator, rudder, throttle), GIMBAL (pitch, roll, yaw), OSD (vSpeed, pitch, roll, yaw, groundOrSky, gpsLevel), CALC (distance2D, distance3D, currentElevation), HOME (lat, lng, maxAllowedHeight), WEATHER (temperature, windDirection, windSpeed)
   - Extended position objects in `flight_track` JSONB to include all telemetry per sampled point

2. **New component: `FlightAnalysisDialog.tsx`** — Full-screen analysis dialog with:
   - Interactive map with drone position marker synced to timeline scrubber
   - Color-coded flight path with trail visualization
   - Start/end position markers

3. **New component: `FlightAnalysisTimeline.tsx`** — Synchronized analysis with:
   - Draggable timeline scrubber with event markers (RTH, low battery, warnings)
   - Info panel showing all values at current scrubber position
   - Tabbed charts: Altitude, Speed (H+V), Battery/Voltage, GPS satellites, RC inputs, Gimbal, Distance from home, Wind
   - Automatic tab visibility based on available data (graceful for old logs)

4. **Integration**:
   - `DroneLogbookDialog.tsx`: BarChart3 icon button on each flight log entry with track data
   - `MissionDetailDialog.tsx`: Flight logs section with "Analyser" button per log

### Backward compatibility
- Existing logs without extended telemetry show a warning badge "Begrenset telemetri"
- New imports will automatically include all telemetry fields
- No database migration needed — `flight_track` is JSONB
