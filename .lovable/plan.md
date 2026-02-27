

## Plan: Fix DJI cloud log download headers

### Problem
When clicking a DJI log from the cloud list, the download call to `GET /api/v1/logs/{accountId}/{logId}/download` fails because the request headers don't match what the DroneLog API expects.

### Root cause
Line 563 in `supabase/functions/process-dronelog/index.ts` sends:
```
Accept: "application/octet-stream"
```
But the API documentation specifies:
```
Content-Type: application/json
Accept: application/json
```

### Change

**`supabase/functions/process-dronelog/index.ts`** (line 562-563):
- Replace the download fetch headers from `{ Authorization: ..., Accept: "application/octet-stream" }` to `{ Authorization: ..., "Content-Type": "application/json", Accept: "application/json" }` to match the API specification.

This is a one-line header change. The rest of the flow (download bytes -> upload to `/logs/upload` -> parse CSV) remains unchanged.

