

## Problem

Two bugs in `supabase/functions/process-dronelog/index.ts`:

### 1. Low battery warning always shows -1%
The LOW_BATTERY event mirror (line 363) uses `minBattery` in its message without checking if battery data was available. When `batteryIdx < 0`, `minBattery` is initialized to `-1` (line 208). Additionally, the field `BATTERY.isVoltageLow` (line 19) likely does not exist in the DroneLog API (not in the official field list), so the LOW_BATTERY event detection on line 305 may be matching an unintended column via the partial-match logic in `findHeaderIndex`, or firing incorrectly.

### 2. Cell deviation never calculated correctly
The field `BATTERY.cellVoltageDeviation [V]` (line 19, used at line 113) does not exist in the DroneLog API. The API provides **individual cell voltages** (`BATTERY.cellVoltage1 [V]` through `BATTERY.cellVoltage6 [V]`), but these are not requested in the FIELDS list. So `battCellDevIdx` is always `-1`, `maxBattCellDev` stays at `0`, and the cell deviation warning on line 358 never triggers from actual data.

## Changes

### 1. Add individual cell voltage fields to FIELDS list
Add `BATTERY.cellVoltage1 [V]` through `BATTERY.cellVoltage6 [V]` to the FIELDS constant (line 13-27).

### 2. Calculate cell deviation from individual cells
After parsing the header indices, find indices for cellVoltage1-6. In the row loop (line 233), read all 6 cell voltages, compute `max - min` of non-zero values as the deviation for that row, and track the maximum deviation across all rows. Remove reliance on the non-existent `BATTERY.cellVoltageDeviation [V]` field.

### 3. Fix LOW_BATTERY mirror warning
On line 363, add a guard: only push the low_battery warning if `minBattery >= 0` (i.e., battery data was actually available). Change the message to use the actual battery percentage only when valid.

### 4. Remove non-existent fields from FIELDS
Remove `BATTERY.cellVoltageDeviation [V]` and `BATTERY.isVoltageLow` from the FIELDS list since they don't exist in the DroneLog API. The LOW_BATTERY detection should rely on the existing `minBattery < 20%` check and/or individual cell voltage analysis instead.

### 5. Redeploy edge function

