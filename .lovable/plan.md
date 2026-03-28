

## Fix: «Kunne ikke opprette oppdrag» — desimaltall i heltallskolonne

### Problem
Konsollfeilen sier: `invalid input syntax for type integer: "10.6"`

Edge function `process-ardupilot` beregner `durationMinutes` med 1 desimal (`Math.round(x * 10) / 10` = `10.6`), men databasekolonnen `flight_logs.flight_duration_minutes` er av typen `integer`. Når frontenden prøver å lagre denne verdien, feiler INSERT-et.

### Fix
**`supabase/functions/process-ardupilot/index.ts`** linje 178:

```text
// Nå:
const durationMinutes = Math.round((durationMs / 60000) * 10) / 10;

// Endres til:
const durationMinutes = Math.round(durationMs / 60000);
```

En enkelt linje-endring. Edge function deployes automatisk.

