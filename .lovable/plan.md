

## Problem

Warning action checkboxes ("Lagre i droneloggbok" + status selector) only appear when `result.warnings` contains items. Two gaps prevent them from showing:

1. **Cell deviation threshold too high**: Currently set at `> 0.3V`, but the screenshot shows `0.258V` displayed in red. The KPI card already flags values `> 0.1V` as red, but the warning generation uses `0.3V`. These should align — threshold should be `> 0.1V`.

2. **LOW_BATTERY event not mirrored as warning**: The `events` array contains `LOW_BATTERY` entries (shown in "Hendelser under flyging"), but a `warnings` entry is only added when `minBattery < 20%`. If the battery percentage stayed above 20% but voltage was low, no warning is generated and thus no checkbox appears.

## Changes

### 1. Lower cell deviation warning threshold (`supabase/functions/process-dronelog/index.ts`)

Change line 358 from `maxBattCellDev > 0.3` to `maxBattCellDev > 0.1` to match the KPI card's red threshold.

### 2. Add low-voltage warning based on detected LOW_BATTERY events

After the existing warning generation block (~line 366), add: if `events` contains any `LOW_BATTERY` type entry and no `low_battery` warning was already generated, push a `low_battery` warning so the checkbox appears.

### 3. Redeploy the `process-dronelog` edge function

