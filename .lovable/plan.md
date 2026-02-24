

## Plan: Save DroneLog API Fields Reference and Fix Field Name Mismatch

### What I Found

I could not parse the uploaded .gdoc file directly (it's a binary PDF), but I successfully retrieved the **complete field list** from the live DroneLog API via the health check endpoint (`GET /api/v1/fields`). This gives us all 200+ available fields with descriptions.

### Important Discovery: Field Name Mismatch (Root Cause of 0 Duration)

The current edge function requests these fields:
```
OSD.latitude, OSD.longitude, OSD.altitude, OSD.height, OSD.flyTimeMilliseconds, OSD.speed, BATTERY.chargeLevel
```

But the API's field metadata shows the actual names are different:
- `OSD.flyTimeMilliseconds` -- The API docs example uses this, but the `/fields` endpoint lists `OSD.flyTime [ms]`
- `OSD.speed` -- Not in the fields list at all; the actual names are `OSD.hSpeed [m/s]`, `OSD.hSpeed [km/h]`, etc.
- `OSD.altitude` and `OSD.height` -- The fields list shows `OSD.altitude [m]`, `OSD.height [m]`, etc.

The CSV response likely uses the actual field names as column headers, causing our parser to fail finding the columns (index = -1), which explains why `durationMinutes` is 0 and speed data is missing.

### Plan

**1. Create `docs/dronelog-api-fields.md`** -- A comprehensive reference of all available DroneLog API fields, organized by category (APP, APPGPS, BATTERY, BATTERY1, BATTERY2, CALC, CAMERA, CUSTOM, DETAILS, GIMBAL, HOME, MC, OSD, RC, RECOVER, RTK, SERIAL, WEATHER).

**2. Update `docs/dronelog-api-reference.md`** -- Update the "Nyttige felter" section to reflect the correct field names.

**3. Fix `supabase/functions/process-dronelog/index.ts`** -- Two changes:
   - Update the `FIELDS` constant to use confirmed field names from the API
   - Make the CSV header matching case-insensitive and partial-match aware, so `OSD.flyTime [ms]` matches even if we request `OSD.flyTimeMilliseconds`

### Technical Details

The parser currently does exact string matching:
```typescript
const timeIdx = headers.indexOf("OSD.flyTimeMilliseconds");
```

If the CSV returns `OSD.flyTime [ms]` as the header, `indexOf` returns -1. Then `cols[-1]` is `undefined`, `parseFloat(undefined)` is `NaN`, and the `!isNaN` check skips it -- resulting in `maxFlyTimeMs = 0` and `durationMinutes = 0`.

The fix adds flexible header lookup that tries exact match first, then falls back to partial matching, and logs the actual headers received for debugging.

