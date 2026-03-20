

## Plan: Fix DroneLog field names and add BATTERY1/BATTERY2 support

### Problem
Many field names in the `FIELDS` array in `process-dronelog/index.ts` use names from an outdated/incorrect API reference. The actual DroneLog API uses different field names, causing battery trend data (cycles, voltage, health) and several analysis fields to return empty.

### Changes

**1. Fix FIELDS array (`supabase/functions/process-dronelog/index.ts`, lines 13-43)**

Replace incorrect field names with correct ones from the actual API:

```
// Fixes:
"BATTERY.totalVoltage [V]"       → "BATTERY.voltage [V]"
"BATTERY.loopNum"                → "BATTERY.timesCharged"
"BATTERY.life [%]"               → "BATTERY.relativeCapacity"
"OSD.directionYaw [°]"          → "OSD.yaw"
"OSD.isMotorUp"                  → "OSD.isMotorOn"
"CALC.distance2D [m]"           → "CALC.distanceFromHome [m]"
"CALC.distance3D [m]"           → "CALC.distanceFromHomeMax [m]"
"CALC.currentElevation [m]"     → (remove — not in API)
"DETAILS.maxAltitude [m]"       → "DETAILS.maxHeight [m]"
"DETAILS.maxHSpeed [m/s]"       → "DETAILS.maxHorizontalSpeed [m/s]"
"DETAILS.maxVSpeed [m/s]"       → "DETAILS.maxVerticalSpeed [m/s]"
"APP.warn"                       → "APP.warning"
```

Add new useful fields:
```
"BATTERY.maxTemperature [C]", "BATTERY.minTemperature [C]"
"BATTERY.maxCellVoltageDeviation [V]"  (already there ✓)
"OSD.isCompassError"
"OSD.voltageWarning"
```

Add BATTERY1/BATTERY2 for dual-battery drones (M350, M300, etc.):
```
"BATTERY1.chargeLevel", "BATTERY1.voltage [V]", "BATTERY1.timesCharged",
"BATTERY1.temperature [C]", "BATTERY1.fullCapacity [mAh]",
"BATTERY1.cellVoltageDeviation [V]", "BATTERY1.maxCellVoltageDeviation [V]",
"BATTERY2.chargeLevel", "BATTERY2.voltage [V]", "BATTERY2.timesCharged",
"BATTERY2.temperature [C]", "BATTERY2.fullCapacity [mAh]",
"BATTERY2.cellVoltageDeviation [V]", "BATTERY2.maxCellVoltageDeviation [V]",
```

**2. Fix header index lookups (same file, lines 100-260)**

Update all `findHeaderIndex` calls to use the corrected field names. Also add indices for BATTERY1/BATTERY2 and new fields.

**3. Update parsing logic (lines 260-415)**

- Parse BATTERY1/BATTERY2 data alongside BATTERY
- For dual-battery drones, track min voltage, max temp, cycles, and cell deviation per battery
- Store dual-battery telemetry in flight_track points (e.g., `battery1`, `voltage1`, `battery2`, `voltage2`)

**4. Update result object (lines 473-518)**

Add new output fields:
- `battery1Cycles`, `battery2Cycles`
- `battery1MinVoltage`, `battery2MinVoltage`  
- `battery1TempMax`, `battery2TempMax`
- `battery1FullCapacity`, `battery2FullCapacity`
- Use BATTERY.maxTemperature/minTemperature for summary stats instead of per-row temp

**5. Update UploadDroneLogDialog.tsx (line ~1116)**

Map corrected result fields to `flight_logs` columns. Handle dual-battery by choosing the worst-case values for the summary fields (lowest voltage, highest temp, lowest capacity).

**6. Update FlightAnalysisTimeline.tsx**

- Show BATTERY1/BATTERY2 as separate lines in the battery chart when dual-battery data exists
- Update tooltip labels

**7. Update EquipmentLogbookDialog.tsx battery trend**

No change needed — the battery trend reads from `flight_logs` columns which will now be populated correctly since the API field names are fixed.

### Files to modify
- `supabase/functions/process-dronelog/index.ts` — fix field names, add BATTERY1/2, update parsing
- `src/components/UploadDroneLogDialog.tsx` — map new result fields to DB columns
- `src/components/dashboard/FlightAnalysisTimeline.tsx` — dual-battery chart lines

### Expected result
- Battery trend tab will show data for new imports (cycles, voltage, temp, capacity)
- Flight analysis shows per-battery data for dual-battery drones
- All telemetry fields correctly populated

