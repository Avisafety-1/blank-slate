

## Plan

Three changes from the approved plan, plus the new "acknowledge warning" feature.

### 1. Fix warning logbook entry date (`UploadDroneLogDialog.tsx`)

In `handleWarningsWithActions`, replace `new Date().toISOString().split('T')[0]` (lines 749 and 759) with the flight date from `result.startTime`. Fall back to today if unavailable.

### 2. Add error handling to status updates (`UploadDroneLogDialog.tsx`)

Capture errors from the `supabase.from('drones').update(...)` and `supabase.from('equipment').update(...)` calls (lines 779, 781). Show toast error on failure.

### 3. Invalidate query cache after warnings saved (`UploadDroneLogDialog.tsx`)

Import `useQueryClient`. After `handleWarningsWithActions` completes successfully, call `queryClient.invalidateQueries` for `['drones']` and `['equipment']` keys.

### 4. Add "Kvitter ut advarsel" (Acknowledge warning) button

**DroneDetailDialog.tsx**: When the drone's DB `status` field is "Gul" or "Rød" (not from maintenance date calculation, but from a manually set warning status), show a button "Kvitter ut advarsel — Sett status til Grønn" next to the status badge. On click:
- Update `drones.status` to "Grønn" in DB
- Insert a logbook entry in `drone_log_entries` with `entry_type: 'Kvittering'` documenting the acknowledgment
- Invalidate queries and refresh

**EquipmentDetailDialog.tsx**: Same pattern — when `equipment.status` is "Gul" or "Rød", show a "Kvitter ut" button. On click:
- Update `equipment.status` to "Grønn"
- Insert entry in `equipment_log_entries` with `entry_type: 'Kvittering'`
- Refresh data

The acknowledge button will use an `AlertDialog` confirmation to prevent accidental clicks, asking "Er du sikker på at du vil kvittere ut advarselen og sette status tilbake til Grønn?"

