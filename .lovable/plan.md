

## Problem

Edge function logs confirm that the company key (`Pwv9Pb…`) gets HTTP 429 on `dji-login` repeatedly. The DroneLog API's 429 response for this endpoint likely doesn't include a `remaining` field, so `getDronelogErrorMessage` defaults to "kvoten er brukt opp" -- which is incorrect. It's just short-term rate-limiting.

The fix is simple: when `remaining` is `null`/`undefined` (i.e., the API didn't tell us the quota is zero), treat it as temporary rate-limiting, not quota exhaustion.

## Changes

### `src/components/UploadDroneLogDialog.tsx` - Fix `getDronelogErrorMessage`

Change the 429 logic: only show "kvote brukt opp" when `remaining` is explicitly `0`. When `remaining` is null/undefined, default to the "vent og prøv igjen" message.

```typescript
if (status === 429) {
  const remaining = error?.remaining;
  // Only show quota exhausted when API explicitly says remaining = 0
  if (remaining !== null && remaining !== undefined && Number(remaining) === 0) {
    return { message: 'DroneLog API-kvoten er brukt opp for denne måneden.', type: 'warning' };
  }
  // Default: temporary rate limit
  return { message: 'For mange forespørsler akkurat nå. Vent noen sekunder og prøv igjen.', type: 'warning' };
}
```

This is a 2-line logic inversion in one file.

