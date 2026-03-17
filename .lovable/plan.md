

## Fix: SafeSky fails to load in regular browser/PWA

**Root cause**: `getSession()` returns a potentially expired token from localStorage without refreshing it. In incognito this works because the token is always fresh. Additionally, `warmUpCache()` is fire-and-forget so the first DB read hits an empty table.

### Changes in `src/lib/mapSafeSky.ts`

**1. Replace `getSession()` with `getUser()` (line 164-174)**

`getUser()` validates the token server-side and triggers a refresh if expired, eliminating the stale-token issue.

```typescript
// Before
const { data: sessionData } = await supabase.auth.getSession();
if (!sessionData?.session) { ... }

// After
const { data: userData, error: userError } = await supabase.auth.getUser();
if (userError || !userData?.user) { ... }
```

**2. Await `warmUpCache()` before first DB fetch (line 291-305)**

Make `start()` async and await the warm-up so the database is populated before the first read.

```typescript
// Before
function start() {
  warmUpCache();                    // fire-and-forget
  fetchSafeSkyBeacons().then(...)   // reads empty table

// After
async function start() {
  await warmUpCache();              // wait for edge function
  if (destroyed) return;
  await fetchSafeSkyBeacons();      // now reads populated table
```

**3. Extend retry burst delays (line 256)**

Change from `[1000, 2000, 3000]` to `[2000, 4000, 6000]` to handle slower edge function cold starts.

