

## Problem

The DJI login response returns `{ result: { djiAccountId: "some-unique-id" } }` but the client extracts the account ID using `data.result?.id || data.result?.accountId` -- neither matches. The field name is `djiAccountId`, so the extraction fails silently and no account ID is captured, causing the subsequent log listing call to fail.

## Fix

### `src/components/UploadDroneLogDialog.tsx` (line ~384)

Add `data.result?.djiAccountId` to the extraction chain:

```js
const accountId = data.result?.djiAccountId || data.result?.id || data.result?.accountId || data.accountId || ...
```

One line change, one file.

