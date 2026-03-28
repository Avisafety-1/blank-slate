

## Fix ArduPilot Log Parsing — Riktigere Data

### Problemer identifisert fra skjermbildet

1. **"Min. batteri: 1804%"** — Parseren bruker `CurrTot` (kumulativ mAh forbrukt) som `remaining`. Dette er IKKE prosent. ArduPilot BATT-meldinger har et `Rem`-felt for gjenværende prosent i nyere firmware.
2. **"Modus: 5", "Modus: 9", "Modus: 6"** — Numeriske modus-IDer i stedet for navn (5=LOITER, 6=RTL, 9=LAND).
3. **For mange «message»-hendelser** — Firmware-versjoner, gimbal device_id, boot-meldinger osv. vises som hendelser.
4. **"ArduCopter ArduCopter"** — Både `aircraftName` og `droneType` satt til samme verdi, UI viser begge.
5. **"10.606966666666667 min"** — Ikke avrundet.

### Endringer

#### 1. Python-parser (`ardupilot-parser/app.py`)

**Batteri**: Bruk `Rem` (remaining %) i stedet for `CurrTot`. Legg til `CurrTot` som separat felt for referanse.

```python
battery_list.append({
    "time_ms": int(getattr(msg, "TimeUS", 0) / 1000),
    "volt": msg.Volt,
    "curr": getattr(msg, "Curr", None),
    "remaining": getattr(msg, "Rem", None),  # prosent 0-100
    "curr_tot": getattr(msg, "CurrTot", None),  # mAh forbrukt
    "temp": getattr(msg, "Temp", None),
})
```

**Modus**: Legg til ArduCopter mode-mapping:

```python
COPTER_MODES = {
    0: "STABILIZE", 1: "ACRO", 2: "ALT_HOLD", 3: "AUTO",
    4: "GUIDED", 5: "LOITER", 6: "RTL", 7: "CIRCLE",
    9: "LAND", 11: "DRIFT", 13: "SPORT", 14: "FLIP",
    15: "AUTOTUNE", 16: "POSHOLD", 17: "BRAKE",
    18: "THROW", 19: "AVOID_ADSB", 20: "GUIDED_NOGPS",
    21: "SMART_RTL",
}
```

Bruk `ModeNum` til oppslag: `mode_name = COPTER_MODES.get(msg.ModeNum, f"MODE_{msg.ModeNum}")`.

**Meldinger**: Filtrer ut boot/system-meldinger. Behold bare relevante:

```python
SKIP_PREFIXES = ["gimbal ", "fmuv", "ChibiOS", "u-blox", "GPS 1:", "EKF"]
```

**Firmware-versjon**: Trekk ut ArduCopter-versjon som eget felt (`firmware_version`).

**Etter endring**: Krever `fly deploy` for å oppdatere Fly.io-tjenesten.

#### 2. Edge function (`supabase/functions/process-ardupilot/index.ts`)

- **`aircraftName`**: Sett til firmware-versjon hvis tilgjengelig (f.eks. "ArduCopter V3.6.12"), ellers `vehicleType`
- **`droneType`**: Sett til `null` for å unngå duplisering i UI
- **`durationMinutes`**: Rund av til 1 desimal
- **`minBattery`**: Ignorer verdier over 100 (tyder på feil data)
- **Meldingsfiltrering i events**: Fjern duplikate meldinger, grupper gjentatte mode_change

### Filer som endres

| Fil | Endring |
|-----|---------|
| `ardupilot-parser/app.py` | Batteri `Rem`, mode-mapping, meldingsfiltrering, firmware-versjon |
| `supabase/functions/process-ardupilot/index.ts` | Fiks aircraftName/droneType, avrunding, batterivalidering, event-filtrering |

### Deploy-steg
1. Kodeendringer i begge filer
2. Bruker kjører `cd ardupilot-parser && fly deploy` for Python-parseren
3. Edge function deployes automatisk av Lovable

