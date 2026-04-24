# Fix plan for build errors and DJI full serial numbers

## Current diagnosis
- The **frontend app is not generally broken**, but the **edge-function build is currently unsuccessful**.
- That matters because DJI import relies on edge functions, so a failed edge build can leave some DJI fixes undeployed.
- The earlier statement that the other errors were irrelevant was too optimistic: even if some errors were already present, they still **block successful deployment** and therefore can block the DJI fix from taking effect.
- The main DJI issue is now clear:
  - `dji-auto-sync` was updated to parse full serial numbers correctly.
  - `dji-process-single` was only **partly** updated.
  - `process-dronelog` — the function used by **manual file import** from `UploadDroneLogDialog` — still uses naive `split(",")` parsing, so **manual imports can still truncate the aircraft serial number**.
  - The UI prompt for “oppdater serienummer?” is **not implemented yet**.

## What I will implement

### 1. Unblock edge-function builds
Fix the errors that currently stop the edge bundle/typecheck from going green:
- Replace or align the functions still importing `npm:@supabase/supabase-js@2.57.2` so they use a supported import pattern already used elsewhere in the project.
- Fix type errors in:
  - `supabase/functions/process-ardupilot/index.ts`
  - `supabase/functions/resend-confirmation-email/index.ts`
  - `supabase/functions/send-calendar-link/index.ts`
- Re-check for any remaining function-level type issues after those fixes.

### 2. Finish the DJI serial-number fix in the manual import path
Update `supabase/functions/process-dronelog/index.ts` so manual file uploads behave like the newer DJI flow:
- Replace all `split(",")` CSV parsing with the same RFC 4180-aware row parser.
- Strip surrounding quotes from `DETAILS.aircraftSN` and `DETAILS.batterySN`.
- Ensure the returned parsed payload preserves the **full 20-character aircraft serial number**.

### 3. Make all DJI matching paths consistent
Apply the same prefix-match logic everywhere DJI logs are processed:
- `supabase/functions/process-dronelog/index.ts`
- `supabase/functions/dji-process-single/index.ts`
- `src/components/UploadDroneLogDialog.tsx` bulk/manual local matching logic

This will allow:
- full 20-char log SN to match an older 16-char stored SN
- older 16-char log SN to match a full stored SN
- consistent drone/battery matching regardless of whether the log came from auto-sync, pending-log processing, or manual upload

### 4. Implement the serial-number update prompt in the UI
Complete the migration UX that was planned but not finished:
- Read `sn_mismatch_suggestion` from `pending_dji_logs`
- Show a clear checkbox/prompt in `UploadDroneLogDialog` when a matched drone/battery has an older truncated SN
- On user confirmation, update the drone/equipment serial number to the full value during import
- Keep it opt-in; no silent overwrite

### 5. Verify the affected flows end-to-end
After the fixes are implemented:
- verify manual DJI file import returns full SN
- verify pending DJI log processing keeps full SN
- verify old 16-char stored drone still auto-matches a new 20-char log
- verify the user sees the update prompt when there is a mismatch
- verify edge functions build cleanly so the fix is actually deployable

## Technical details
- Manual import currently goes through `supabase.functions.invoke('process-dronelog', ...)` in `src/components/UploadDroneLogDialog.tsx`, so fixing only `dji-auto-sync` is not enough.
- `process-dronelog` still has naive parsing at the current CSV read points and still builds `aircraftSN` without the new quote-safe cleanup.
- `dji-process-single` already has `parseCsvRow`, but its drone/battery auto-match still uses exact equality instead of the prefix-match helper pattern used in `dji-auto-sync`.
- The prompt path is only partially prepared at the database level (`sn_mismatch_suggestion` exists in types/migration), but the UI is not consuming it yet.

## Result
When this is done:
- the edge build will succeed again
- manual DJI imports will no longer truncate serial numbers
- old 16-char entries will still match new 20-char logs
- users will be asked before upgrading stored serial numbers to the full value