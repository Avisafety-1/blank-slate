

## Plan: Add "High-resolution import" toggle

### Summary
Add a checkbox option in the import dialog that lets the user choose between standard resolution (~200 points) and high resolution (~2000 points) for telemetry data. The edge function also needs its limit raised so enough data is available.

### Changes

**1. `src/components/UploadDroneLogDialog.tsx`**
- Add a new state: `const [highResImport, setHighResImport] = useState(false)`
- Add a checkbox in the import UI (near the import button / before confirmation): "Importer høy-oppløselig posisjonsdata" with a small info text explaining it gives ~1-second resolution for flight analysis but uses more storage
- In the three save locations (lines ~1378, ~1422, ~1492), change `maxPts`/`maxPoints` from hardcoded `200` to `highResImport ? 2000 : 200`

**2. `supabase/functions/process-dronelog/index.ts`**
- Line 281: Increase server-side sample target from 500 to 2500 (`Math.floor((lines.length - 1) / 2500)`) so the edge function returns enough points for high-res mode

### UI placement
The checkbox appears in the import confirmation step, alongside the existing options (drone selection, battery, etc.), styled consistently with other toggles in the dialog.

### Trade-offs
- High-res: ~600KB per flight vs ~60KB standard — acceptable for JSONB
- Edge function always returns up to 2500 points now; the client decides how many to keep
- Existing flights remain unchanged; only new imports are affected by the toggle

