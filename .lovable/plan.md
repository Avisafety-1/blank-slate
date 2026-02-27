

## Plan: Use downloadUrl directly in POST /logs

### Problem
The current flow calls `GET /logs/{accountId}/{logId}/download` to get a file URL, then passes it to `POST /logs`. But the download URL is already available in the log list response as `downloadUrl` — no need for the extra API call that's returning errors.

### Changes

**1. `src/components/UploadDroneLogDialog.tsx`** — Pass the `downloadUrl` to the action call:
- Change the `callDronelogAction("dji-process-log", { accountId, logId })` call to also include `downloadUrl: log.url`

**2. `supabase/functions/process-dronelog/index.ts`** — Simplify the `dji-process-log` action:
- Accept `downloadUrl` from the request body
- Remove Step 1 entirely (the `GET /download` call and URL extraction, lines 560-582)
- Use the provided `downloadUrl` directly in `POST /logs` with `{ url: downloadUrl, fields: fieldList }`

This eliminates the failing intermediate API call entirely.

