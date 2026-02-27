

## Plan: Fix download headers and ensure deployment

### Problem
The edge function logs show "calling POST /logs with downloadUrl" — an older version is running. The current file code does fetch from downloadUrl first, but is missing required headers. The user confirmed `GET /logs/{accountId}/{logId}/download` works with proper headers.

### Changes

**`supabase/functions/process-dronelog/index.ts`** — Line 562-564, add missing headers to the download fetch:

```typescript
const fileRes = await fetch(downloadUrl, {
  headers: {
    Authorization: `Bearer ${dronelogKey}`,
    "Content-Type": "application/json",
    "Accept": "application/json",
  },
  redirect: "follow",
});
```

Then redeploy the edge function to ensure the latest code is active.

