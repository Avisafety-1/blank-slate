

## Fix: Use BATTERY.status for Battery Health

### Problem
The previous fix changed the battery health field to `BATTERY.life [%]`, but this field is **not included in the FIELDS list** sent to the DroneLog API — so it never appears in the CSV response, meaning `batteryHealth` would always be `null`.

The correct field for battery health is `BATTERY.status` (and/or `BATTERY.status.RAW`), as confirmed by you.

### Current State
- `BATTERY.status` is already requested from the API (line 24 in FIELDS)
- `battStatusIdx` is already parsed (line 140)
- `batteryStatus` is already read from the CSV (line 225) as a **string**
- It's returned in the result object as `batteryStatus` (line 634)
- But it's never used for `batteryHealth` — instead the non-existent `BATTERY.life [%]` is used

### What We Need to Know
`BATTERY.status` is a string field. To store it as `battery_health_pct` (a numeric percentage), we need to understand what values it returns. Possible scenarios:
- It could be a numeric string like `"96"` → parse directly
- It could be a status string like `"Normal"` / `"Good"` → need mapping logic
- `BATTERY.status.RAW` might be a separate numeric field

### Changes

**File: `supabase/functions/process-dronelog/index.ts`**

1. **Add `BATTERY.status.RAW` to FIELDS list** (line 24) — this may provide a numeric health value
2. **Add header index** for `BATTERY.status.RAW`
3. **Update `batteryHealth` derivation** (line 631): Try `BATTERY.status.RAW` first (parse as number), fall back to parsing `BATTERY.status` if it's numeric
4. **Remove the unused `BATTERY.life [%]` index** (line 139) since this field is not in the FIELDS list

**Deploy** the updated edge function.

### Risk
If `BATTERY.status.RAW` is not a recognized field by DroneLog API, it will simply not appear in the CSV (no error). The fallback to `BATTERY.status` string parsing ensures we still capture data. If neither yields a numeric value, `batteryHealth` will be `null` (safe).

