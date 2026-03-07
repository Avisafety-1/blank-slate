

## Problem

Every log insert fails with:
```
invalid input syntax for type timestamp with time zone: "10/15/2022T3:10:09.16 PMZ"
```

The `startTime` parsing logic in `dji-auto-sync/index.ts` does:
1. Try `new Date(startTime.replace(/Z$/, '').replace('T', ' '))` 
2. If that parses successfully, it keeps the **original string** as-is
3. PostgreSQL rejects the US date format

The fix: when the Date constructor successfully parses the value, convert it to ISO format using `toISOString()` instead of keeping the original string.

## Plan

### 1. Fix date conversion in `dji-auto-sync/index.ts`

In the `parseCsvMinimal` function around the startTime parsing block, after confirming the date is valid, replace the original string with the ISO representation:

```typescript
if (startTime) {
    const testParsed = new Date(startTime.replace(/Z$/, '').replace('T', ' '));
    if (!isNaN(testParsed.getTime())) {
      // Convert to ISO format for PostgreSQL compatibility
      startTime = testParsed.toISOString();
    } else {
      // Try regex fallback for unusual formats
      // ... existing regex logic ...
    }
}
```

This single change fixes all the failing inserts since every date that JS can parse will be stored as a valid ISO 8601 timestamp.

### 2. Redeploy and test

After the fix, the user can click "Sync nå" again and logs should successfully appear in `pending_dji_logs`.

