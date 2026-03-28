

## ArduPilot Parser Forbedringer — app.py

### Endringer i `ardupilot-parser/app.py`

**1. Vehicle-type-basert mode-resolving**

Problemet: Mode-mapping prøver COPTER_MODES først, deretter PLANE_MODES, uansett kjøretøytype. Mode 5 betyr "LOITER" for copter men "FLY_BY_WIRE_A" for plane.

Løsning:
- Flytt vehicle_type-deteksjon til **første pass** (scan MSG-meldinger først)
- Legg til ROVER_MODES og SUB_MODES
- Velg riktig map basert på detektert vehicle_type
- Implementert som to-pass: pass 1 finner firmware, pass 2 parser alt

Nye mode-maps:
```python
ROVER_MODES = {
    0: "MANUAL", 1: "ACRO", 3: "STEERING", 4: "HOLD",
    5: "LOITER", 6: "FOLLOW", 7: "SIMPLE", 10: "AUTO",
    11: "RTL", 12: "SMART_RTL", 15: "GUIDED",
}

SUB_MODES = {
    0: "STABILIZE", 1: "ACRO", 2: "ALT_HOLD", 3: "AUTO",
    4: "GUIDED", 7: "CIRCLE", 9: "SURFACE", 16: "POSHOLD",
    19: "MANUAL",
}
```

**2. GPS leap second korreksjon**

GPS-tid er ~18 sekunder foran UTC (per 2024). Legger til leap second offset i `_gps_to_utc_iso`:
```python
GPS_LEAP_SECONDS = 18  # as of 2024
dt = GPS_EPOCH + timedelta(weeks=..., milliseconds=...) - timedelta(seconds=GPS_LEAP_SECONDS)
```

**3. Summary-blokk i output**

Ny `summary`-seksjon beregnet server-side:
```python
"summary": {
    "duration_s": ...,
    "max_alt_m": ...,
    "max_speed_mps": ...,
    "distance_m": ...,
    "battery_start_v": ...,
    "battery_end_v": ...,
    "battery_min_v": ...,
    "error_count": ...,
    "event_count": ...,
    "warning_count": ...,
}
```

Beregnes fra GPS (alt, spd, distanse via haversine), battery (volt), errors og events.

**4. Meldingsfilter: behold rå, returner filtrert**

I stedet for å kaste bort filtrerte meldinger:
- `messages`: filtrert liste (som i dag)
- `messages_all`: komplett liste uten filtrering

UI bruker `messages`, men rådataene er tilgjengelige for debugging/revisjon.

**5. Mindre forbedringer**
- Reduser aggressivt meldingsfilter: fjern "ekf" og "gps 1:" fra SKIP-listen (kan inneholde viktige varsler)
- Mode-nummer beholdes alltid som `mode_num` for referanse

### Filer som endres

| Fil | Endring |
|-----|---------|
| `ardupilot-parser/app.py` | Alt over: to-pass parsing, ROVER/SUB modes, leap seconds, summary, messages_all |

### Etter endring
Bruker kjører `cd ardupilot-parser && fly deploy`

Edge function trenger ingen endring — den kan bruke `summary`-feltet direkte for å populere normaliserte felter.

