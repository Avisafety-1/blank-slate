

## Fix: "Begrenset telemetri" for newly imported flights

### Problem
The edge functions correctly parse and return extended telemetry (speed, RC inputs, gimbal, battery, wind, etc.) in the `positions` array. However, the **client-side code** in `UploadDroneLogDialog.tsx` strips all that data before saving to the database.

Three places (lines ~1377, ~1421, ~1491) do:
```typescript
const rawTrack = result.positions.map(p => ({ lat: p.lat, lng: p.lng, alt: p.alt, timestamp: p.timestamp }));
```

This discards every extended field (speed, vSpeed, battery, rcAileron, gimbalPitch, etc.), so `flight_track.positions` in the DB only has basic coordinates. The `FlightAnalysisDialog` then correctly detects "no advanced data" and shows the badge.

### Solution
Change all three `rawTrack` mappings to preserve all properties from each position point, instead of picking only 4 fields.

Replace:
```typescript
const rawTrack = result.positions.map(p => ({ lat: p.lat, lng: p.lng, alt: p.alt, timestamp: p.timestamp }));
```
With:
```typescript
const rawTrack = result.positions.map(p => ({ ...p }));
```

This preserves all telemetry fields while still allowing the downsampling logic that follows.

### Files changed
- `src/components/UploadDroneLogDialog.tsx` — 3 lines changed (lines ~1377, ~1421, ~1491)

### Notes
- No database changes needed — `flight_track` is JSONB
- Existing flights imported before this fix will still show "Begrenset telemetri" (correct behavior)
- Only newly imported flights will have full telemetry

