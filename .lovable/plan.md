

## Fix: Batteri-serienummer fra DJI-logger

### Problem
Edge-funksjonen ber om feltet `DETAILS.batterySN` fra DroneLog API, men det korrekte feltnavnet er `DETAILS.batterySerial`. Derfor returnerer API-et aldri batteriserienummeret, og `batterySN` blir alltid tom streng — ingen batteri-matching eller opprettelsesprompt trigges.

Merk: For `aircraftSN` har vi allerede løst dette ved å be om **begge** (`DETAILS.aircraftSN` og `DETAILS.aircraftSerial`) og bruke fallback. Samme mønster trengs for batteri.

### Endring

**`supabase/functions/process-dronelog/index.ts`**

1. I `FIELDS`-listen (linje 24): legg til `"DETAILS.batterySerial"` ved siden av eksisterende `"DETAILS.batterySN"`
2. Legg til en ny header-index (etter linje 134):
   ```
   const detBatterySerialIdx = findHeaderIndex(headers, "DETAILS.batterySerial");
   ```
3. Oppdater batterySN-utlesningen (linje 164) til å bruke fallback, identisk med aircraftSN-mønsteret:
   ```
   const rawBatterySN = detBatterySNIdx >= 0 ? firstRow[detBatterySNIdx] : "";
   const batterySerial = detBatterySerialIdx >= 0 ? firstRow[detBatterySerialIdx] : "";
   const batterySN = (rawBatterySN || batterySerial).replace(/^"|"$/g, "").trim();
   ```
4. Legg til en logg-linje for debugging:
   ```
   console.log("Battery SN indices — batterySN:", detBatterySNIdx, "batterySerial:", detBatterySerialIdx, "resolved:", batterySN);
   ```

Ingen andre filer trenger endring — frontend og matching-logikken bruker allerede `result.batterySN` korrekt.

