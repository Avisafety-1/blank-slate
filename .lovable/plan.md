

## Fix: "Kunne ikke opprette oppdrag" from duplicate DJI file

### Problem
When a DJI log file already exists in the database and the user chooses "Opprett nytt oppdrag" (create new mission), the insert into `flight_logs` fails because `dronelog_sha256` has a unique constraint (`idx_flight_logs_sha256_company`) per company. The system correctly detects the duplicate early but still allows the user to click "create new," which then crashes.

### Root cause
`handleCreateNew` (line 1415) inserts a new `flight_logs` row with the same `dronelog_sha256` value via `buildExtendedFields(result)`. The DB unique index rejects it.

### Solution
In `handleCreateNew`, when the flight log is a known duplicate (i.e., `matchedLog` exists with the same SHA-256), set `dronelog_sha256` to `null` on the new row to avoid the constraint violation. This way the new mission + log is created as a separate entry, and the original log retains its SHA-256 for future dedup.

### Changes

**`src/components/UploadDroneLogDialog.tsx`** (~line 1444-1452):
- After building the insert payload with `buildExtendedFields(result)`, override `dronelog_sha256` to `null` if `matchedLog` already exists (meaning the user explicitly chose to create a duplicate).

