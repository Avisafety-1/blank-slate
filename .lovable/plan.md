

## Legg til RCIN-parsing for ArduPilot

### Hva som mangler
- `app.py` parser ikke `RCIN`-meldinger
- Edge function mapper ikke RC-data til `rcAileron`, `rcElevator`, `rcThrottle`, `rcRudder`
- UI-et (StickWidget, RC-grafer) er allerede ferdig — det trenger bare data

### Endringer

**`ardupilot-parser/app.py`**
- Parse `RCIN`-meldinger i pass 2:
```python
elif msg_type == "RCIN":
    try:
        rcin_list.append({
            "time_ms": int(getattr(msg, "TimeUS", 0) / 1000),
            "c1": getattr(msg, "C1", 1500),
            "c2": getattr(msg, "C2", 1500),
            "c3": getattr(msg, "C3", 1000),
            "c4": getattr(msg, "C4", 1500),
        })
    except Exception:
        pass
```
- Returner `"rcin": rcin_list` i output

**`supabase/functions/process-ardupilot/index.ts`**
- Les `raw.rcin` array
- Interpoler RCIN-verdier inn i hver posisjon:
  - `C1` → `rcAileron` (Roll)
  - `C2` → `rcElevator` (Pitch)
  - `C3` → `rcThrottle`
  - `C4` → `rcRudder` (Yaw)
- Verdier sendes som rå PWM (~1000-2000) — StickWidget normaliserer allerede fra 364-1684 (DJI-range), så vi justerer StickWidget til å håndtere standard PWM-range (1000-2000) for ArduPilot

**`src/components/dashboard/StickWidget.tsx`**
- Oppdater normalize-range til å håndtere både DJI (364-1684) og standard PWM (1000-2000):
  - Autodetekt basert på verdier (hvis > 900 → PWM-range)
  - Eller: bruk 1000-2000 som universell range (DJI-verdier mappes uansett korrekt)

### Filer

| Fil | Endring |
|-----|---------|
| `ardupilot-parser/app.py` | Parse RCIN C1-C4, returner `rcin` array |
| `supabase/functions/process-ardupilot/index.ts` | Interpoler RCIN → rcAileron/rcElevator/rcThrottle/rcRudder i positions |
| `src/components/dashboard/StickWidget.tsx` | Utvid normalize til PWM-range (1000-2000) |

### Etter endring
- `cd ardupilot-parser && fly deploy`
- Edge function deployes automatisk

### Svar på spørsmål 2
3D-modellen og kunstig horisont drives av **ATT-telemetri** (pitch, roll, yaw) som allerede interpoleres inn i hver posisjon for ArduPilot. Når du skrubber tidslinjen, oppdateres `Drone3DViewer` og `DroneAttitudeIndicator` i sanntid basert på disse verdiene. Dette fungerer allerede for ArduPilot-logger.

