

## Plan: Multi-select DJI cloud logs for bulk import

### Current behavior
- DJI cloud log list shows individual logs as clickable buttons
- Clicking one immediately processes it via the DroneLog API and goes to the result step
- Only one log can be imported at a time

### New behavior
- Each log row gets a checkbox for multi-select
- A "select all" checkbox at the top
- Selected count shown with an "Importer valgte" button
- Clicking the button triggers bulk processing (same flow as file bulk upload) — each selected log is processed via `dji-process-log`, dedup-checked, auto-matched to drones/batteries, and saved to `pending_dji_logs`
- Progress shown in `bulk-result` step with per-log status
- Single-click on a log still works for quick single import (or we can keep it checkbox-only for consistency)

### Technical details

**File: `src/components/UploadDroneLogDialog.tsx`**

1. **Add state**: `selectedDjiLogIds: Set<string>` to track checked logs

2. **Update DJI logs list UI** (lines 2246-2269):
   - Add checkbox to each log row
   - Add "select all" toggle at top
   - Add "Importer valgte (N)" button at bottom
   - Keep single-click as a quick-import option (bypasses checkbox)

3. **Add `handleBulkDjiImport` function**: Loops through selected DJI logs sequentially (API rate limiting requires this), calling `dji-process-log` for each, then saving to `pending_dji_logs` — reusing the same dedup/match logic from `handleBulkUpload`. Shows progress in the `bulk-result` step.

4. **Update `BulkResult` interface**: The `fileName` field will show the aircraft name/date for DJI cloud logs instead of a filename.

5. **Add 15s cooldown between API calls** to respect DroneLog rate limits (existing pattern from `startImportCooldown`).

### Files
- `src/components/UploadDroneLogDialog.tsx` — add multi-select state, UI checkboxes, and bulk DJI import handler

