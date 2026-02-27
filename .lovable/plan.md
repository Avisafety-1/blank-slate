

## Plan: Revert beacons endpoints to x-api-key auth

### Problem
The `/v1/beacons` endpoint used by `safesky-beacons-fetch` returns "Access denied" with HMAC auth. The `/v1/uav` and `/v1/advisory` endpoints work fine with HMAC.

### Changes

**`supabase/functions/safesky-beacons-fetch/index.ts`**:
- Remove `import { generateAuthHeaders }` from safesky-hmac
- Replace HMAC auth headers with simple `x-api-key: {SAFESKY_BEACONS_API_KEY}` header

**`supabase/functions/safesky-beacons/index.ts`**:
- This function calls `/v1/uav` which works with HMAC -- no change needed (it should keep HMAC)

### Summary
Only `safesky-beacons-fetch` changes. The other 3 functions (`safesky-beacons`, `safesky-advisory`, `safesky-cron-refresh`) keep HMAC auth.

