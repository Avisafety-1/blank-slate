

## Fix: Show drone registration number in mission drone list

### Problem
In the mission dialog drone selector, the code references `drone.registrering` which is not a valid field. The actual database column is `registreringsnummer`. This results in drones showing as e.g. "DJI Matrice ()" with empty parentheses.

### Solution
Replace `drone.registrering` with `drone.registreringsnummer` in three places in `AddMissionDialog.tsx`, and conditionally show the parentheses only when `registreringsnummer` is set.

### Changes

**File: `src/components/dashboard/AddMissionDialog.tsx`**

1. **Line 1341** — Command search value: change `drone.registrering` to `drone.registreringsnummer`
2. **Line 1350** — Display text: change `{drone.modell} ({drone.registrering})` to conditionally show registration number only if it exists: `{drone.modell}{drone.registreringsnummer ? ` (${drone.registreringsnummer})` : ''}`
3. **Line 1369** — Selected drone badge: same conditional pattern for `drone?.registreringsnummer`

