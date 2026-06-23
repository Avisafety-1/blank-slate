## To fixer

### 1. "Ukjent drone" i ArduPilot-varselmailen
`checkFlightAlerts` slår opp `selectedDrone` fra `drones`-arrayet i komponentens render-scope. I praksis returnerer dette `undefined` for noen av ArduPilot-flytene (mest sannsynlig "oppdater eksisterende pending-log"-stien på linje 1873, der `selectedDroneId` ikke alltid er populert fra det matchede loggoppføringen).

**Fix i `src/components/UploadDroneLogDialog.tsx` (`checkFlightAlerts`, linje 2105–2180):**
- Slå opp drone direkte fra `selectedDroneId` med fallback til `matchedLog?.drone_id` (gjelder kun denne ArduPilot-grenen — DJI-flyten røres ikke).
- Hvis fortsatt ingen treff, bruk `parsedResult.droneModel`/serienummer fra parseren som drone-navn istedenfor "Ukjent drone".
- Logg en `console.warn` med `selectedDroneId` + tilgjengelige drone-id-er hvis fallback brukes (for fremtidig debugging).

### 2. "Batteri nådde 0%" når ArduPilot ikke har batteridata
ArduPilot lagrer `BAT.RemPct` (remaining percent) bare når `BATT_CAPACITY` er konfigurert. Når det mangler returnerer parseren `validBatteryReadings = []` og setter `minBattery = 0` (linje 175 i `_shared/ardupilot-normalize.ts`). I klienten kjører `low_battery`-sjekken `minBattery >= 0 && minBattery < 20` → falskt varsel "Batteri nådde 0%".

**Fix i `supabase/functions/_shared/ardupilot-normalize.ts` (linje 175):**
- Endre `const minBattery = validBatteryReadings.length > 0 ? Math.min(...) : 0;` til returnere `-1` (eller `null` med tilhørende typesignatur) når det ikke finnes gyldige avlesninger.
- Den eksisterende guarden `parsedResult.minBattery >= 0` på klientsiden filtrerer da bort `low_battery`-varslet automatisk når ArduPilot ikke har batteridata.
- DJI-flyten er ikke berørt (DJI bruker `process-dronelog`, ikke `ardupilot-normalize.ts`).

Ingen DB-endringer. Krever redeploy av `process-ardupilot` edge-funksjonen etter endring i `_shared`.

### Tekniske detaljer
- `_shared/ardupilot-normalize.ts` brukes også av `dji-process-single` (sjekker) — verifiseres at endringen ikke påvirker DJI-stier. (Sannsynligvis ikke importert der, men sjekkes før edit.)
- `UnifiedDroneLogResult.minBattery: number` kan beholde `number`-typen siden `-1` er gyldig sentinel som allerede er respektert i UI-koden.