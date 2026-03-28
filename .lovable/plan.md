

## ArduPilot Parser: Referansefil og dataanalyse

### XML-filen lagres som referanse
Filen `ardupilotmega.xml.txt` er MAVLink-protokolldefinisjonen. Den beskriver MAVLink-meldinger sendt over telemetri, **ikke** dataflash-loggformat (.bin). Dataflash-logger bruker egne meldingstyper (GPS, BATT, ATT, MODE, MSG, PARM, VIBE, RCOU, EV, ERR, CTUN, etc.) som pymavlink leser automatisk.

XML-en er likevel nyttig som referanse for å forstå feltnavn og enums.

### Hva parseren henter i dag

| Meldingstype | Data hentet |
|---|---|
| GPS | lat, lng, alt, spd, nSat |
| BAT/BATT | volt, curr, remaining (Rem), curr_tot, temp |
| ATT | pitch, roll, yaw |
| MODE | mode nummer → navn-oppslag |
| MSG | fritekstmeldinger (filtrert) |
| PARM | alle parametere (men returneres uten å brukes i normalisering) |

### Hva vi KAN hente i tillegg fra dataflash-logger

| Meldingstype | Hva den inneholder | Verdi for oss |
|---|---|---|
| **VIBE** | Vibrasjonsnivåer (VibeX, VibeY, VibeZ, Clip0, Clip1, Clip2) | Viktig for dronehelseovervåking — høy vibrasjon = dårlig propellbalanse |
| **ERR** | Feilkoder (Subsys, ECode) | Kritiske feil under flyging — EKF-feil, GPS glitches, failsafe-utløsere |
| **EV** | Events (Id) — arming, disarming, failsafe | Nøyaktig arm/disarm-tidspunkt, failsafe-hendelser |
| **CTUN** | Kontrolltunering (ThI=throttle in, ThO=throttle out, Alt, DAlt) | Vertikal hastighet (maxVSpeed), throttle-bruk |
| **RCOU** | RC-utgangssignaler (C1-C14) | Motorbelastning/ESC-verdier |
| **POWR** | Strømforsyning (Vcc, VServo) | Diagnostikk — lav Vcc = ustabilt system |
| **GPS** felt `GMS` | GPS-tidsstempel i millisekunder siden midnatt | **Faktisk klokketid** — kan gi `startTime`/`endTimeUtc` |
| **GPS** felt `GWk` | GPS-ukenummer | Sammen med GMS → absolutt UTC-tid |
| **BATT** med `Instance` | Batteriinstans (0, 1, ...) | Dual-batteri-støtte |

### Viktigste forbedringer

1. **Absolutt tid** (`startTime`/`endTimeUtc`): GPS-meldinger inneholder `GWk` (GPS week) og `GMS` (ms since start of week). Med disse kan vi beregne eksakt UTC-tid for flygingens start og slutt. I dag er begge `null`.

2. **Vertikal hastighet** (`maxVSpeed`): Fra CTUN-meldinger kan vi beregne maks vertikal hastighet. I dag er den `null`.

3. **Vibrasjon/helsedata**: VIBE-meldinger gir vibrasjonsnivåer som kan brukes til å generere varsler om propell-/motorproblemer.

4. **Feilhendelser**: ERR-meldinger gir spesifikke failsafe-hendelser (GPS glitch, EKF variance, battery failsafe) som bør bli events i tidslinjen.

5. **Arming/disarming**: EV-meldinger gir eksakt arm/disarm-tidspunkt som gir mer presis flygetid.

6. **Dual-batteri**: BATT med Instance-felt kan gi data for batteri 1 og 2 separat.

### Filer som endres

| Fil | Endring |
|---|---|
| `ardupilot-parser/app.py` | Hent VIBE, ERR, EV, CTUN, POWR. Beregn UTC-tid fra GPS GWk/GMS. Splitt BATT per instance. |
| `supabase/functions/process-ardupilot/index.ts` | Map nye felter: maxVSpeed fra CTUN, startTime/endTimeUtc fra GPS-tid, vibrasjonsvarsler, ERR→events, dual-batteri |

### Endring i `app.py` (Python-parser)

Nye datastrukturer i `_parse_bin()`:

```python
# Nye lister
vibe_list = []      # VibeX, VibeY, VibeZ, Clip0/1/2
err_list = []       # Subsys, ECode
ev_list = []        # Id (arm=10, disarm=11, failsafe=...)
ctun_list = []      # ThI, ThO, Alt, DAlt, DSAlt, SAlt, ...
powr_list = []      # Vcc, VServo

# GPS: hent også GWk og GMS for UTC-beregning
gps_list.append({
    ...eksisterende felt...,
    "gps_week": getattr(msg, "GWk", None),
    "gps_ms": getattr(msg, "GMS", None),
})

# BATT: hent Instance for dual-batteri
battery_list.append({
    ...eksisterende felt...,
    "instance": getattr(msg, "Instance", 0),
})
```

UTC-beregning fra GPS week/ms:
```python
def gps_to_utc(gps_week, gps_ms):
    """GPS epoch = 6 jan 1980. Legg til uker + ms."""
    import datetime
    gps_epoch = datetime.datetime(1980, 1, 6, tzinfo=datetime.timezone.utc)
    return gps_epoch + datetime.timedelta(weeks=gps_week, milliseconds=gps_ms)
```

### Endring i edge function (normalisering)

```typescript
// Vertikal hastighet fra CTUN
const ctun = raw.ctun || [];
let maxVSpeed = 0;
for (const c of ctun) {
  const vs = Math.abs(c.dalt || 0);  // DAlt = desired alt change rate
  if (vs > maxVSpeed) maxVSpeed = vs;
}

// UTC-tid fra GPS week/ms
const firstGps = gps.find(g => g.gps_week && g.gps_ms);
const lastGps = [...gps].reverse().find(g => g.gps_week && g.gps_ms);
const startTime = firstGps ? gpsToUtc(firstGps.gps_week, firstGps.gps_ms) : null;
const endTimeUtc = lastGps ? gpsToUtc(lastGps.gps_week, lastGps.gps_ms) : null;

// Dual-batteri
const batt0 = battery.filter(b => (b.instance || 0) === 0);
const batt1 = battery.filter(b => (b.instance || 0) === 1);
const isDualBattery = batt1.length > 0;

// ERR → events
for (const e of raw.errors || []) {
  events.push({ type: "error", message: `Feil: subsystem ${e.subsys}, kode ${e.ecode}`, ... });
}
```

### Etter endring
1. Bruker kjører `cd ardupilot-parser && fly deploy`
2. Edge function deployes automatisk
3. Test med samme ArduPilot-loggfil — nå med absolutt tid, vertikal hastighet, vibrasjonsvarsler og dual-batteri

### Hva vi IKKE henter (unødvendig for flytlogg-analyse)
- RCOU (RC-output): For detaljert motordiagnostikk, ikke relevant for standard logg
- ESC-telemetri: Spesialisert, sjelden i vanlige logger
- POWR: Diagnostikk, kan legges til senere ved behov

