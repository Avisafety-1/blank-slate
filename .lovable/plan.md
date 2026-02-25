

# Remove drone selector from upload/login steps

## Background

The drone selector currently appears in **three places**:
1. **Upload step** (line 1006-1013) — mandatory-looking selector before processing
2. **DJI login step** (line 1041-1048) — marked as optional
3. **Result/logbook section** (line 815-832) — the final selector with auto-match feedback

Since the logbook section on the result step already has a drone selector (with SN auto-matching), the earlier selectors are redundant. The auto-match logic already sets `selectedDroneId` when it finds a serial number match after processing, making pre-selection unnecessary.

## Changes

**File: `src/components/UploadDroneLogDialog.tsx`**

### 1. Remove drone selector from upload step (lines 1006-1013)

Remove the `<div>` containing the drone `<Select>` from the file upload step. The file can be processed without a drone selected.

### 2. Remove drone selector from DJI login step (lines 1041-1048)

Remove the `<div>` containing the drone `<Select>` from the DJI login step.

### 3. Keep auto-match logic intact

The existing auto-match code (which sets `selectedDroneId` based on `aircraftSN`/`aircraftSerial` after parsing) remains — it will still pre-select the drone in the logbook section on the result step.

### 4. Remove `!file` guard only (upload button)

The upload button currently requires `!file || isProcessing`. No change needed — drone is no longer required to proceed.

Result: one fewer step of friction. Drone selection happens once, in the logbook section, with auto-match feedback visible.

