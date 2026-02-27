

## Problem

The log listing response from DroneLog API returns `result` as a direct array:
```json
{ "statusCode": 200, "result": [ { "id": 654704210, ... } ] }
```

But `fetchDjiLogs` extracts logs with `r.logs || []` which returns an empty array since there is no `logs` property.

## Fix

### `src/components/UploadDroneLogDialog.tsx` (~line 439-440)

Change the extraction logic to handle both shapes:

```typescript
const r = data.result || data;
const logs = Array.isArray(r) ? r : (r.logs || []);
```

One line change, one file.

