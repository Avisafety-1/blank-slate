

## Analysis

Two separate issues:

### 1. API 500 Error (Root Cause)
The `downloadUrl` from the DJI log list is `https://dronelogapi.com/api/v1/logs/dji_abc123/654704210/download` — this is an API endpoint, not a direct file URL. When passed to `POST /api/v1/logs`, which expects a direct file URL like `https://example.com/file.txt`, the DroneLog server tries to fetch from its own endpoint and fails with a 500.

**Fix**: The edge function must first call `GET {downloadUrl}` (with auth) to get the actual file URL or binary, then either:
- Pass the resolved direct URL to `POST /logs`, OR
- Download the bytes and upload via `POST /logs/upload` (multipart)

Since we don't know if the `/download` endpoint returns a redirect or JSON with a URL, the safest approach is to call the `downloadUrl` with the API key, follow redirects, and if the response is a file, upload it via `/logs/upload`. If it returns JSON with a URL, use that URL with `POST /logs`.

### 2. UI Issue — All logs show spinner
`isProcessing` is a single boolean. When one log is clicked, all log buttons show the spinner and become disabled. Should track which specific `logId` is being processed.

## Plan

### File 1: `supabase/functions/process-dronelog/index.ts`
In the `dji-process-log` handler (lines 554-586):
1. Call `GET {downloadUrl}` with the Bearer token
2. Check response content-type:
   - If JSON: extract the file URL from the response and pass it to `POST /logs` with `{ url, fields }`
   - If binary/octet-stream: read the bytes and upload via `POST /logs/upload` (multipart, same pattern already used in the file upload section)
3. Parse CSV response with `parseCsvToResult()` as before

### File 2: `src/components/UploadDroneLogDialog.tsx`
- Change `isProcessing` (boolean) to `processingLogId` (string | null)
- Set it to the specific `log.id` when clicked
- Only show spinner and disable for that specific log item
- Clear to `null` in `finally`

