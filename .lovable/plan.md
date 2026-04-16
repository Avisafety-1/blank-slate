

## Fix: Battery Health Reading Wrong Field

### Problem
Battery health for TB100 1-3 shows incorrect values (e.g. 52%) because the code reads the wrong DroneLog API field.

In `process-dronelog/index.ts` line 139, battery health is read from `BATTERY.relativeCapacity` — which is the **charge level at the start of recording** (state of charge), NOT the battery lifetime health. The correct field is `BATTERY.life [%]`, which is already requested from the API but never read from the CSV response.

Evidence: TB100 2 shows 52% "health" on April 13 (= charge level when log started), while it had 98% on April 2 (= different charge level at that recording start).

### Fix

**File: `supabase/functions/process-dronelog/index.ts`** (line 139)
- Change `findHeaderIndex(headers, "BATTERY.relativeCapacity")` to `findHeaderIndex(headers, "BATTERY.life [%]")`

**File: `supabase/functions/dji-auto-sync/index.ts`**
- Same field name fix if present

**File: `supabase/functions/dji-process-single/index.ts`**
- This function does not parse `BATTERY.life [%]` at all currently, but it does not set battery health either — no change needed.

### After Deploy
The existing incorrect values on the three TB100 batteries will need to be corrected. This can happen automatically when new flight logs are processed, or you can manually clear the `battery_health_pct` on the equipment records.

