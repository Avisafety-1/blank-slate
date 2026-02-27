

## Plan: Use POST /logs with URL instead of download+upload

### Problem
The current two-step approach (download file via `/logs/{accountId}/{logId}/download`, then upload to `/logs/upload`) returns a 500 Server Error. The API docs suggest using `POST /api/v1/logs` with a `url` parameter instead.

### Root cause
The `/download` endpoint likely returns a direct file URL. Instead of downloading the bytes and re-uploading them via multipart, we can pass that URL directly to `POST /api/v1/logs` which accepts a `url` body parameter and processes it server-side.

### Change

**`supabase/functions/process-dronelog/index.ts`** — Replace lines 554-635 (the `dji-process-log` action):

1. Keep Step 1: Call `GET /logs/{accountId}/{logId}/download` to get the file URL from the JSON response
2. Replace Step 2: Instead of fetching the file bytes and uploading via multipart to `/logs/upload`, call `POST /logs` with:
   ```json
   {
     "url": "<fileUrl from step 1>",
     "fields": ["OSD.latitude", "OSD.longitude", ...]
   }
   ```
   With headers: `Authorization`, `Content-Type: application/json`, `Accept: application/json`
3. Parse the CSV response with `parseCsvToResult()` as before

This eliminates the file download + multipart re-upload, using the simpler JSON-body endpoint that the API supports natively.

