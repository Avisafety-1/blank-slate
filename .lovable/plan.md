

## Problem

Edge function returns 502 when uploading a flight log file. The DroneLog API responds with 422: `"The fields field must be an array."` This means:

1. The original code sent `fields` as a single comma-separated string — API rejected it wanting an array
2. The fix changed it to `fields[]` (PHP-style array notation) — but Deno's FormData doesn't produce the PHP-expected format

## Root Cause

The DroneLog API (Laravel/PHP backend) expects the FormData key to be literally `fields[]` for array parsing. However, the real issue may be that the Deno runtime's `FormData` serializes differently from browser FormData. Looking at the docs JavaScript example, fields is sent as a comma-separated string: `formData.append('fields', 'OSD.latitude,OSD.longitude,...')`.

The contradiction between the docs (comma-separated string) and the API error (must be an array) suggests the API was updated. We need to try the PHP array convention properly.

## Plan

**File: `supabase/functions/process-dronelog/index.ts`**

Change the fields append logic to try both approaches — send each field individually with the key `fields[]` but also ensure no extra whitespace or encoding issues:

```typescript
const dronelogForm = new FormData();
dronelogForm.append("file", file);
const fieldList = FIELDS.split(",");
for (const field of fieldList) {
  dronelogForm.append("fields[]", field.trim());
}
```

If that still fails (same error), the fallback approach is to send it as a JSON-encoded array string:
```typescript
dronelogForm.append("fields", JSON.stringify(FIELDS.split(",")));
```

**Additionally**, add a `console.log` before the request to log the fields being sent, so we can debug if this attempt also fails.

## Technical Details

- The `fields[]` convention works in PHP frameworks (Laravel) when parsing multipart/form-data
- Deno's `fetch` with `FormData` should produce the same wire format, but there could be subtle differences
- If `fields[]` doesn't work, `JSON.stringify` of the array is the next approach
- The file upload endpoint URL and auth headers are correct (confirmed by the user's successful test in the DroneLog docs UI)

