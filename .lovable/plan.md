

## Problem

The `dji-auto-sync` function is successfully downloading and parsing DJI logs, but ALL inserts into `pending_dji_logs` fail with:

```
invalid input syntax for type integer: "974.6"
```

The `duration_seconds` column is type `integer`, but the parsed `durationSeconds` value is a float (e.g. 974.6). Every single log fails on this insert, which is why the table is empty and the user sees "0 logger behandlet".

## Plan

### 1. Fix the database column type
Change `duration_seconds` from `integer` to `real` (float) via a migration to accept decimal values.

### 2. Fix the edge function to round the value
As a belt-and-suspenders approach, also `Math.round()` the `durationSeconds` value before insert in `dji-auto-sync/index.ts`. This ensures compatibility regardless of column type.

### Expected result
After these fixes, re-running "Sync nå" should successfully insert logs into `pending_dji_logs`, and they will appear in the "Logger til behandling" (pending logs) section in the upload dialog.

