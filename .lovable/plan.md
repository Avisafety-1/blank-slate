

# Fix: Flight Log → Mission Matching Logic

## Current Behavior (Problems)

The current `findMatchingFlightLog` function has three issues:

1. **Searches `flight_logs`, not `missions`**: It queries the `flight_logs` table filtered by date, then checks joined `missions.tidspunkt`. This means it can only find missions that already have a flight log attached -- new/empty missions will never match.

2. **4-hour window is too wide**: The time comparison uses `4 * 60 * 60 * 1000` ms, which can match unrelated missions on the same day.

3. **No "create new" option when a match is found**: When exactly one match is found, the user is forced to update it. The "Opprett nytt oppdrag" button only appears when there are zero matches or when explicitly deselected from the multi-candidate list.

## Proposed Fix

### Step 1: Add direct mission search

After the SHA-256 dedup check, query the `missions` table directly:

```text
SELECT id, tittel, tidspunkt, status, lokasjon
FROM missions
WHERE company_id = :companyId
  AND tidspunkt BETWEEN (flightStart - 1h) AND (flightEnd + 1h)
ORDER BY ABS(tidspunkt - flightStart) ASC
```

This finds missions whose scheduled time overlaps with or is within 1 hour of the flight's start/end time.

### Step 2: Change the matching flow

Current flow:
```text
SHA-256 check → search flight_logs → time match → duration match → fallback
```

New flow:
```text
SHA-256 check (keep as-is for updates)
  ↓
Search missions by time overlap (1-hour window)
  ↓
If 1+ missions found → show as candidates (radio list)
  ↓
Always include "Opprett nytt oppdrag" as final option
```

### Step 3: Update state + UI

- Add new state: `matchedMissions` (list of mission candidates from direct query)
- When user selects a mission, the flight log is created and linked to that `mission_id`
- When user selects "Opprett nytt oppdrag", existing `handleCreateNew` logic runs
- The existing `matchedLog` (SHA-256 dedup) flow stays untouched for updating existing logs

### Step 4: UI changes in result step

The result step will show:

1. **If SHA-256 match found**: Green box "Eksisterende flylogg funnet" + "Oppdater flylogg" button (unchanged)
2. **If mission candidates found**: Amber box with radio list of matching missions + "Opprett nytt oppdrag" at the bottom. Button: "Lagre flylogg" (creates flight_log linked to selected mission)
3. **If no matches**: Blue box "Ingen oppdrag matcher" + "Opprett nytt oppdrag" button (unchanged)

### Files to modify

| File | Change |
|---|---|
| `src/components/UploadDroneLogDialog.tsx` | Rewrite `findMatchingFlightLog` to query missions directly; add `matchedMissions` state; update result UI to show mission candidates with "create new" always available; add `handleLinkToMission` handler |

### Key details

- The 1-hour window uses both `start_time_utc` (from DJI data) and the flight duration to compute the flight's time range, then checks overlap with `missions.tidspunkt`
- Existing SHA-256 dedup logic is preserved exactly as-is
- The existing `flight_logs` matching (for updates) only triggers on SHA-256 match, removing the fragile date+duration fallback
- `handleLinkToMission` creates a new `flight_log` row with the selected `mission_id`, without creating a new mission

