

## Problem

The current DJI cloud sync flow has an incorrect step for processing individual logs:

1. **DJI Login** (`POST /api/v1/accounts/dji`) -- Correct
2. **List Logs** (`GET /api/v1/logs/{accountId}`) -- Correct
3. **Process Log** -- **Wrong**: Currently sends `log.url || log.id` to `POST /api/v1/logs` (which expects a raw URL to a file). The correct endpoint is `GET /api/v1/logs/{accountId}/{logId}/download` to first download the log file, then process it via `/logs/upload`.

## Fix

### Edge function (`supabase/functions/process-dronelog/index.ts`)

Replace the `dji-process-log` action:

- Accept `{ accountId, logId }` instead of `{ url }`
- Step 1: `GET /api/v1/logs/{accountId}/{logId}/download` to download the raw flight log file
- Step 2: Send that file to `POST /api/v1/logs/upload` (reusing the existing multipart upload logic) to get parsed CSV
- Step 3: Parse CSV and return result as before

### Client (`src/components/UploadDroneLogDialog.tsx`)

- Update `handleSelectDjiLog` to pass `{ accountId, logId: log.id }` instead of `{ url: log.url || log.id }`
- Ensure `accountId` state is available when calling

### Summary of changes

Two files modified:
1. **Edge function**: New download-then-process logic in `dji-process-log` action
2. **Client dialog**: Pass `accountId` + `logId` instead of `url`

