

# Fix: Empty credential_id stored in passkeys table

## Root Cause

The passkey in the database has an **empty `credential_id`** (length 0). This is why Android says "no passkeys available" — the login flow can't match any credential.

In SimpleWebAuthn **v13**, `registrationInfo.credential.id` is already a `Base64URLString` (a plain string), not a `Uint8Array`. Calling `isoBase64URL.fromBuffer()` on a string returns an empty result.

## Fix

**`supabase/functions/webauthn/index.ts`** — line 171:

```typescript
// Before (broken — cred.id is already a