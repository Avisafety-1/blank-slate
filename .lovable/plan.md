

## Plan: Migrate SafeSky edge functions to HMAC authentication

### Background
SafeSky has deprecated the simple `x-api-key` header authentication and now requires HMAC-SHA256 signed requests. All 4 SafeSky edge functions need to be updated.

### Step 1: Update the SAFESKY_API_KEY secret
You will need to provide the new SafeSky API key (format: `ssk_live_...` or `ssk_sandbox_...`). I will prompt you to add it. The `SAFESKY_BEACONS_API_KEY` secret (if it's a separate key) will also need updating.

### Step 2: Create shared HMAC auth module
Create `supabase/functions/_shared/safesky-hmac.ts` implementing the HMAC-SHA256-V1 signing protocol from the SDK:

- `deriveKid(apiKey)` - HKDF-SHA256 to derive Key Identifier (base64url)
- `deriveHmacKey(apiKey)` - HKDF-SHA256 to derive 32-byte signing key
- `generateNonce()` - UUID v4 via `crypto.randomUUID()`
- `generateTimestamp()` - ISO8601 UTC format
- `buildCanonicalRequest(method, path, query, host, timestamp, nonce, body)` - canonical string
- `generateSignature(canonicalRequest, hmacKey)` - HMAC-SHA256 hex signature
- `generateAuthHeaders(apiKey, method, url, body?)` - returns all 4 required headers:
  - `Authorization: SS-HMAC Credential={kid}/v1, SignedHeaders=host;x-ss-date;x-ss-nonce, Signature={sig}`
  - `X-SS-Date`
  - `X-SS-Nonce`
  - `X-SS-Alg: SS-HMAC-SHA256-V1`

Uses Deno's Web Crypto API (HKDF + HMAC via `crypto.subtle`).

### Step 3: Update all 4 edge functions
Replace every `fetch(url, { headers: { 'x-api-key': key } })` call with HMAC-signed headers:

1. **`safesky-beacons-fetch/index.ts`** - 1 GET call to `/v1/beacons`
2. **`safesky-beacons/index.ts`** - 1 GET call to `/v1/uav`
3. **`safesky-cron-refresh/index.ts`** - multiple POST `/v1/advisory` + GET `/v1/uav` calls
4. **`safesky-advisory/index.ts`** - multiple POST `/v1/advisory`, POST `/v1/uav`, GET `/v1/uav` calls

Each will import `generateAuthHeaders` from `../_shared/safesky-hmac.ts` and spread the returned headers into the fetch options.

### Technical detail: HMAC-SHA256 signing flow

```text
API Key ──► HKDF(SHA256, info="safesky-kid") ──► KID (base64url)
API Key ──► HKDF(SHA256, info="safesky-hmac") ──► HMAC Key (32 bytes)

Canonical Request = METHOD + "\n"
                  + path + "\n"
                  + queryString + "\n"
                  + "host:" + host + "\n"
                  + "x-ss-date:" + timestamp + "\n"
                  + "x-ss-nonce:" + nonce + "\n"
                  + SHA256(body)

Signature = HMAC-SHA256(hmacKey, canonicalRequest) → hex

Authorization = "SS-HMAC Credential={kid}/v1, SignedHeaders=host;x-ss-date;x-ss-nonce, Signature={signature}"
```

### Files changed
- **New:** `supabase/functions/_shared/safesky-hmac.ts`
- **Modified:** `supabase/functions/safesky-beacons-fetch/index.ts`
- **Modified:** `supabase/functions/safesky-beacons/index.ts`
- **Modified:** `supabase/functions/safesky-cron-refresh/index.ts`
- **Modified:** `supabase/functions/safesky-advisory/index.ts`
- **Secret update:** `SAFESKY_API_KEY` (new HMAC key value)

