

# Fix: Flytid logges i minutter i stedet for timer

## Rotarsak

Det er **to problemer**:

### Problem 1: DB-triggere bruker feil enhet

I `supabase/migrations/20260206153154_...sql` legger triggerne `flight_duration_minutes` rett til `flyvetimer` uten a dele pa 60:

```sql
-- Drone-trigger (linje 8):
SET flyvetimer = COALESCE(flyvetimer, 0) + NEW.flight_duration_minutes
-- 16 minutter blir lagt til som 16 timer!

-- Equipment-trigger (linje 33):
SET flyvetimer = COALESCE(flyvetimer, 0) + v_duration
-- Samme feil
```

### Problem 2: Drone-timer oppdateres dobbelt

For droner skjer det DOBBELT oppdatering:
1. DB-triggeren `trg_update_drone_hours` kjorer ved INSERT i `flight_logs` (legger til minutter som timer)
2. App-koden `updateDroneFlightHours()` kjorer ogsa og legger til `minutes / 60` (korrekt enhet, men dobbelt)

Sa for en 16-minutters flytur far dronen: `16 + 0.267 = 16.267` timer i stedet for `0.267` timer.

## Losning

### 1. Ny migrasjon: Fiks begge triggere

Oppdater trigger-funksjonene til a dele pa 60.0:

```sql
-- Drone
SET flyvetimer = COALESCE(flyvetimer, 0) + NEW.flight_duration_minutes / 60.0

-- Equipment  
SET flyvetimer = COALESCE(flyvetimer, 0) + v_duration / 60.0
```

### 2. Fjern manuell drone-oppdatering fra app-koden

I `UploadDroneLogDialog.tsx`, fjern kallet til `updateDroneFlightHours()` (linje 628, 684) og selve funksjonen (linje 697-700), fordi triggeren na handterer dette korrekt.

### 3. Sjekk pilot-oppdatering

Pilot-koden i `saveLogbookEntries` gjor `durationMinutes / 60` korrekt, og det finnes ingen trigger for `flight_log_personnel`, sa den er OK.

## Endringer

- **Ny SQL-migrasjon**: `CREATE OR REPLACE FUNCTION` for begge trigger-funksjoner med `/ 60.0`
- **`src/components/UploadDroneLogDialog.tsx`**: Fjern `updateDroneFlightHours`-kall og funksjonen
- Vurder ogsa om `LogFlightTimeDialog.tsx` har samme dobbelt-oppdatering (den har kommentaren "trigger will auto-update drone flyvetimer" men bruker ogsa manuell oppdatering)

