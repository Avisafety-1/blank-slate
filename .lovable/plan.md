

## Problem

The DJI log listing endpoint uses a `page` query parameter (`?page=${page}&limit=${limit}`) which does not exist in the DroneLog API. The API uses `limit` and `createdAfterId` for pagination. This causes the API to return no results or unexpected behavior.

## Fix

### 1. Edge function (`supabase/functions/process-dronelog/index.ts`)

Update `dji-list-logs` action:
- Remove `page` parameter
- Add `createdAfterId` parameter support
- Build query string with `limit` and optionally `createdAfterId`

```
GET /logs/{accountId}?limit=20
GET /logs/{accountId}?limit=20&createdAfterId=654704209
```

### 2. Client (`src/components/UploadDroneLogDialog.tsx`)

- Replace `djiPage` state with `djiCreatedAfterId` (tracking the last log ID for pagination)
- Update `fetchDjiLogs` to pass `createdAfterId` instead of `page`
- Update pagination buttons: "Next" passes the last log's ID as `createdAfterId`; "Previous" can be removed or replaced with a simple history stack
- Keep accumulating logs or replace list on each fetch

### Summary

Two files changed:
1. **Edge function**: Replace `page` with `createdAfterId` in the query string to `/logs/{accountId}`
2. **Client dialog**: Update pagination logic to use cursor-based `createdAfterId` instead of page numbers

