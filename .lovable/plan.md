

## Problem

The "Batteritrend" tab is blank for all batteries because the Supabase query returns a **400 error**:

```
column flight_logs.battery_full_capacity_mah does not exist
```

The column `battery_full_capacity_mah` exists on the `equipment` table, not on `flight_logs`. The recent code change incorrectly added it to the `flight_logs` SELECT query, breaking the entire tab.

## Root Cause

The migration `20260313...` added `battery_full_capacity_mah` to the **`equipment`** table. The migration `20260224...` added `battery_temp_min_c`, `battery_temp_max_c`, `battery_voltage_min_v` to `flight_logs` -- but NOT `battery_full_capacity_mah`.

## Fix

### Option A: Remove the non-existent column from the query (quick fix)

In `src/components/resources/EquipmentLogbookDialog.tsx`:
- Remove `battery_full_capacity_mah` from the `fetchBatteryTrend` SELECT query
- Remove `capacityMah` from the `BatteryTrendEntry` interface and all UI references to it
- The capacity data can instead be shown from the equipment record itself (already displayed in `EquipmentDetailDialog`)

### Option B: Add the column to `flight_logs` via migration

- Create a migration: `ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS battery_full_capacity_mah integer;`
- Update the edge functions (`process-dronelog`, `dji-auto-sync`, `dji-process-single`) to write `battery_full_capacity_mah` to `flight_logs` when inserting/updating
- This gives per-flight capacity tracking (capacity degradation over time)

## Recommendation

**Option B** is better long-term -- it enables tracking capacity degradation per flight, which is the intended use case. The fix involves:

1. **Database migration**: Add `battery_full_capacity_mah` column to `flight_logs`
2. **Edge function updates**: Write the capacity value when inserting flight logs (3 functions: `process-dronelog`, `dji-auto-sync`, `dji-process-single`)
3. **No UI changes needed** -- the current `EquipmentLogbookDialog.tsx` code is already correct once the column exists

### Files to modify
- New migration SQL file
- `supabase/functions/process-dronelog/index.ts` -- add capacity to INSERT
- `supabase/functions/dji-auto-sync/index.ts` -- add capacity to INSERT
- `supabase/functions/dji-process-single/index.ts` -- already parses `fullCapacity` but doesn't store it per-flight

