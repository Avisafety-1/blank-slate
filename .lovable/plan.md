

## Advanced Flight Analysis — Missing API Fields

### Current vs Available

Du har helt rett. Her er en komplett oversikt over hva vi henter i dag vs hva som er tilgjengelig og relevant for avansert flyanalyse:

```text
HENTES I DAG                          MANGLER (relevant for analyse)
─────────────────────────────────     ─────────────────────────────────
OSD: lat, lng, alt, height,           OSD.vSpeed [m/s]        ← vertikal hastighet
  flyTime, hSpeed, gpsNum,            OSD.pitch [°]           ← drone pitch
  flycState, goHomeStatus             OSD.roll [°]            ← drone roll
                                      OSD.directionYaw [°]    ← heading/retning
BATTERY: chargeLevel, temp,            OSD.xSpeed [m/s]        ← komponent-hastighet
  totalVoltage, current, loopNum,      OSD.ySpeed [m/s]        ← komponent-hastighet
  fullCapacity, currentCapacity,       OSD.isMotorUp           ← motor-status
  life, status, cellVoltage1-6,        OSD.flycCommand         ← aktiv kommando
  cellDeviation-felter                 OSD.groundOrSky         ← bakke/luft
                                      OSD.gpsLevel            ← GPS-kvalitet
RC: (ingenting!)                       OSD.isGPSUsed           ← GPS aktiv
                                      OSD.isVisionUsed        ← vision aktiv
GIMBAL: (ingenting!)
                                      RC.aileron              ← styrespak høyre/venstre
CALC: (ingenting!)                     RC.elevator             ← styrespak opp/ned
                                      RC.rudder               ← rotasjon
HOME: goHomeStatus                     RC.throttle             ← gass

                                      GIMBAL.pitch [°]        ← kameravinkel
                                      GIMBAL.roll [°]
                                      GIMBAL.yaw [°]

                                      CALC.distance2D [m]     ← avstand fra home
                                      CALC.distance3D [m]
                                      CALC.currentElevation [m] ← terreng

                                      HOME.latitude           ← hjemmeposisjon
                                      HOME.longitude
                                      HOME.maxAllowedHeight [m]

                                      WEATHER.temperature [°C]
                                      WEATHER.windDirection [°]
                                      WEATHER.windSpeed [m/s]
```

### Oppsummering av mangler

Hele 4 kategorier hentes ikke i det hele tatt: **RC, GIMBAL, CALC, WEATHER**. Pluss flere viktige OSD-felter (vSpeed, pitch, roll, yaw, groundOrSky).

### Oppdatert plan

#### 1. Utvide FIELDS-listen i alle 3 edge functions

Legge til ~22 nye felter i FIELDS-konstanten i:
- `supabase/functions/process-dronelog/index.ts`
- `supabase/functions/dji-process-single/index.ts`
- `supabase/functions/dji-auto-sync/index.ts`

Nye felter å legge til:
```
OSD.vSpeed [m/s], OSD.pitch [°], OSD.roll [°], OSD.directionYaw [°],
OSD.groundOrSky, OSD.gpsLevel, OSD.isMotorUp, OSD.flycCommand,
RC.aileron, RC.elevator, RC.rudder, RC.throttle,
GIMBAL.pitch [°], GIMBAL.roll [°], GIMBAL.yaw [°],
CALC.distance2D [m], CALC.distance3D [m], CALC.currentElevation [m],
HOME.latitude, HOME.longitude, HOME.maxAllowedHeight [m],
WEATHER.temperature [°C], WEATHER.windDirection [°], WEATHER.windSpeed [m/s]
```

Dette koster ingenting ekstra — det er samme API-kall, bare flere kolonner i CSV-responsen.

#### 2. Utvide `flight_track` posisjonsobjektet

Hvert nedsamplet punkt utvides fra:
```json
{ "lat": 59.9, "lng": 10.7, "alt": 120, "height": 50, "timestamp": "PT60S" }
```
til:
```json
{
  "lat": 59.9, "lng": 10.7, "alt": 120, "height": 50, "timestamp": "PT60S",
  "speed": 5.2, "vSpeed": -0.3, "battery": 85,
  "voltage": 15.2, "current": 12.5, "temp": 38,
  "gpsNum": 18, "gpsLevel": 5,
  "pitch": -2.1, "roll": 0.5, "yaw": 182,
  "rcAileron": 1024, "rcElevator": 1100, "rcRudder": 1024, "rcThrottle": 1200,
  "gimbalPitch": -45, "gimbalRoll": 0, "gimbalYaw": 180,
  "dist2D": 150, "dist3D": 158, "elevation": 70,
  "flycState": "GPS_Atti", "groundOrSky": "Sky",
  "windSpeed": 3.2, "windDir": 220
}
```

Størrelse øker fra ~50 til ~250 bytes per punkt. Med 500 samples: ~125KB per flylogg — fortsatt uproblematisk.

#### 3. Ny UI: FlightAnalysisDialog + FlightAnalysisTimeline

- **Kart** med drone-markør synkronisert til scrubber
- **Tidslinje-scrubber** som styrer alle visninger
- **Synkroniserte grafer** (i tabs): Høyde, Hastighet (h+v), Batteri/Spenning, RC-input, Gimbal, GPS/Satellitter, Avstand fra home, Vind
- **Hendelsesmarkører** på tidslinjen (advarsler, RTH, lav GPS, lavt batteri)
- **Infopanel** som viser alle verdier for valgt tidspunkt

#### 4. Integrasjon

"Analyser flytur"-knapp i DroneLogbookDialog og MissionDetailDialog.

### Filer som endres/opprettes

| Fil | Endring |
|---|---|
| `supabase/functions/process-dronelog/index.ts` | Utvide FIELDS + posisjonsobjekt |
| `supabase/functions/dji-process-single/index.ts` | Samme |
| `supabase/functions/dji-auto-sync/index.ts` | Samme |
| `src/components/dashboard/FlightAnalysisDialog.tsx` | **Ny** |
| `src/components/dashboard/FlightAnalysisTimeline.tsx` | **Ny** |
| `src/components/resources/DroneLogbookDialog.tsx` | Legg til "Analyser"-knapp |
| `src/components/dashboard/MissionDetailDialog.tsx` | Legg til "Analyser"-knapp |

Ingen databaseendringer — `flight_track` er JSONB og aksepterer de nye feltene automatisk. Eksisterende logger beholder sin data (bakoverkompatibelt).

