

## ArduPilot-logg (.bin/.zip) støtte — normalisert til DJI-format

### Oversikt
Legg til støtte for ArduPilot .bin-filer (direkte eller i .zip). Parseren kjører som en Python-tjeneste på Fly.io. En ny edge function mottar filen, sender den til parseren, normaliserer resultatet til eksakt samme `DroneLogResult`-format som DJI-loggene bruker, og returnerer det. UI-et trenger minimale endringer — kun akseptere `.bin` i tillegg til `.txt/.zip`, og rute filen til riktig edge function basert på filtype.

### Arkitektur

```text
Frontend (.bin/.zip upload)
  → Edge Function "process-ardupilot"
    → Fly.io Python parser (pymavlink)
    → Normaliserer til DroneLogResult
    → Returnerer identisk JSON som process-dronelog
  → Eksisterende result-steg, lagring, analyse — ALT uendret
```

### 1. Python parser på Fly.io

**Ny tjeneste**: Flask/FastAPI app som tar imot .bin-fil og returnerer rå data.

- Bruker `pymavlink` (`mavutil.mavlink_connection`) for å lese .bin
- Henter meldingstyper: `GPS`, `BAT`/`BATT`, `ATT`, `MODE`, `STAT`, `RCIN`, `MSG`, `EV`
- Returnerer rå JSON:
```json
{
  "gps": [{ "time_ms": ..., "lat": ..., "lng": ..., "alt": ..., "spd": ..., "nSat": ... }],
  "battery": [{ "time_ms": ..., "volt": ..., "curr": ..., "remaining": ... }],
  "attitude": [{ "time_ms": ..., "pitch": ..., "roll": ..., "yaw": ... }],
  "modes": [{ "time_ms": ..., "mode": ... }],
  "messages": [{ "time_ms": ..., "text": ... }],
  "params": { "BATT_CAPACITY": ..., ... },
  "vehicle_type": "ArduCopter" | "ArduPlane" | ...
}
```

**Deployment**: Dockerfile med `pymavlink`, eksponert via HTTP. Sikres med shared secret.

### 2. Edge Function: `process-ardupilot`

**Ny fil**: `supabase/functions/process-ardupilot/index.ts`

- Mottar `multipart/form-data` med .bin eller .zip fil
- Hvis .zip → pakk ut og finn .bin-fil
- Send .bin til Fly.io parser
- **Normaliser** svaret til eksakt `DroneLogResult`-format:

```typescript
// GPS → positions (samme format som DJI)
positions: gps.map(p => ({
  lat: p.lat, lng: p.lng, alt: p.alt,
  height: p.alt, // AGL hvis tilgjengelig
  timestamp: `PT${Math.round(p.time_ms/1000)}S`,
  speed: p.spd,
  // Berike med attitude-data interpolert til GPS-tidspunkt
  pitch: interpolatedAtt.pitch,
  roll: interpolatedAtt.roll,
  yaw: interpolatedAtt.yaw,
}))

// Battery → batteryReadings, minBattery, etc.
// Modes → events med type/message/t_offset_ms
// Beregn summary: maxAltitude, maxSpeed, duration, etc.
```

- Returnerer JSON som er 1:1 kompatibel med `DroneLogResult` fra `process-dronelog`
- Setter `source: 'ardupilot'` i stedet for `'dronelogapi'`

### 3. DB-endring

Ingen ny tabell. Kun utvide `source`-feltet (allerede `text`, ingen constraint) til å støtte `'ardupilot'` i tillegg til `'dronelogapi'`.

Legg til en kolonne `source_file_type` på `pending_dji_logs` for å skille ArduPilot fra DJI:

```sql
ALTER TABLE pending_dji_logs ADD COLUMN source_file_type text DEFAULT 'dji';
```

### 4. Frontend-endringer (minimale)

**`src/components/UploadDroneLogDialog.tsx`** — 3 små endringer:

1. **Filtype-filter**: Utvid aksepterte filer fra `['.txt', '.zip']` til `['.txt', '.zip', '.bin']`

2. **Upload-ruting**: I `handleUpload` — sjekk filtype. Hvis `.bin` (eller .zip som inneholder .bin), kall `process-ardupilot` i stedet for `process-dronelog`:
```typescript
const isArduPilot = file.name.toLowerCase().endsWith('.bin') ||
  (file.name.toLowerCase().endsWith('.zip') && await containsBinFile(file));
const endpoint = isArduPilot ? 'process-ardupilot' : 'process-dronelog';
```

3. **Bulk upload**: Samme logikk for bulk — rut til riktig endpoint per fil.

4. **Notes-tekst**: Bruk `source` for å sette `Importert fra ArduPilot-flylogg` vs `Importert fra DJI-flylogg`.

**Ingen andre UI-endringer.** Resultatet fra edge function er allerede i `DroneLogResult`-format, så `FlightAnalysisDialog`, kart, batteri-grafer, events — alt fungerer automatisk.

### 5. Config

**`supabase/config.toml`**: Legg til:
```toml
[functions.process-ardupilot]
verify_jwt = false
```

**Secrets**: Legg til `ARDUPILOT_PARSER_URL` og `ARDUPILOT_PARSER_SECRET` i edge function secrets.

### Filer som endres/opprettes

| Fil | Endring |
|-----|---------|
| `supabase/functions/process-ardupilot/index.ts` | **Ny** — edge function som sender .bin til Fly.io og normaliserer til DroneLogResult |
| `src/components/UploadDroneLogDialog.tsx` | Utvid aksepterte filtyper, rut til riktig endpoint |
| `supabase/config.toml` | Legg til process-ardupilot config |
| DB-migrasjon | `source_file_type` kolonne på `pending_dji_logs` |

### Stegvis implementering

**Steg 1**: DB-migrasjon (source_file_type)
**Steg 2**: Edge function `process-ardupilot` med normalisering (midlertidig mock/stub til Fly.io-parseren er klar)
**Steg 3**: Frontend-endringer (aksepter .bin, rut til riktig endpoint)
**Steg 4**: Python parser på Fly.io (kan utvikles separat, edge function kaller den)

### Viktig prinsipp
- **ALL normalisering skjer i edge function** — ikke i Python-parseren, ikke i frontend
- Frontend vet ikke forskjell på DJI og ArduPilot etter parsing
- Eksisterende `FlightAnalysisDialog`, `FlightAnalysisTimeline`, `DroneLogbookDialog` osv. forblir helt uendret

