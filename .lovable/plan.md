

## Root Cause

The current flow downloads the raw file from `/download`, then re-uploads it to `/logs/upload`. The DroneLog API returns 500 because re-uploading a downloaded file through multipart is fragile and unnecessary.

The API docs show `POST /logs` accepts a `url` parameter. Since we already have the `downloadUrl` from the log list response, we should pass it directly — no download, no re-upload.

## Plan

### 1. Simplify `dji-process-log` in `supabase/functions/process-dronelog/index.ts`

Replace the entire download-then-upload logic (lines 602-687) with a single `POST /logs` call:

```
POST /api/v1/logs
{ "url": downloadUrl, "fields": [...] }
```

- Use the `downloadUrl` from the log list response as the primary source
- Fall back to constructing `${DRONELOG_BASE}/logs/${accountId}/${logId}/download` if `downloadUrl` is missing
- Keep the existing `uploadRawBytes` function only as a last-resort fallback if `POST /logs` fails with a non-429 error
- Keep all 429/error handling intact

### 2. Pass `downloadUrl` from client

In `src/components/UploadDroneLogDialog.tsx`, the `handleSelectDjiLog` already passes `downloadUrl: log.url`. No client changes needed.

### Technical Detail

```text
Current (broken):
  GET /download → raw bytes → POST /logs/upload (multipart) → 500

Fixed:
  POST /logs { url: downloadUrl, fields: [...] } → CSV → parse
```

