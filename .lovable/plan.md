

# Analyse: ChatGPT-forslag vs. nåværende implementering

## Hva vi allerede har

### Edge function (`process-dronelog/index.ts`)
Allerede henter og parser:
- Posisjoner (lat/lng/alt/height), hastighet, flytid, GPS-satellitter
- Batteri: chargeLevel, temperature, voltage, current, loopNum, fullCapacity, currentCapacity, life, status
- Metadata: startTime, aircraftName, aircraftSN, aircraftSerial, droneType, batterySN
- Totals: totalTime, totalDistance, maxAltitude, maxHSpeed, maxVSpeed, maxDistance
- Advarsler: flycState, APP.warn, høydeanomalier
- Dato-normalisering med fallback-kjede (DETAILS.startTime → CUSTOM.date UTC → CUSTOM.dateTime)

### Klienten (`UploadDroneLogDialog.tsx`)
- Opplasting og DJI Cloud-synkronisering
- Auto-matching av drone på serienummer
- Matching av eksisterende flylogger (tid/drone+varighet/enkelt-dato)
- Lagrer til `missions` + `flight_logs` + `flight_track` (JSONB)
- Oppdaterer drone flyvetimer og oppretter advarsler i `drone_log_entries`

### Database (`flight_logs`-tabellen)
Eksisterende kolonner: id, company_id, user_id, drone_id, mission_id, departure_location, landing_location, flight_duration_minutes, movements, flight_date, notes, created_at, flight_track (jsonb), dronetag_device_id

## Hva ChatGPT foreslår som er NYTT

### A) Ny `flights`-tabell
En dedikert tabell med strukturerte kolonner for alt DroneLog returnerer: `details_sha256` (deduplisering), `battery_temp_min/max`, `battery_cell_dev_max_v`, `gps_sat_min/max`, `rth_triggered`, `drone_model`, `aircraft_serial`, osv.

### B) Ny `flight_events`-tabell
Strukturerte hendelser (APP_WARNING, RTH, LOW_BATTERY, SENSOR) per flight med timestamp, type, og rå-verdier.

### C) Deduplisering via `DETAILS.sha256Hash`
Unik constraint på hash for å forhindre duplikater.

### D) Nye felter fra API
- `DETAILS.sha256Hash`, `DETAILS.guid` — ikke i vår FIELDS-liste ennå
- `BATTERY.cellVoltageDeviation [V]` — ikke i FIELDS
- `BATTERY.timesCharged` — trolig alias for `BATTERY.loopNum`
- `BATTERY.isVoltageLow`, `BATTERY.goHomeStatus` — ikke i FIELDS
- `OSD.goHomeStatus`, `HOME.goHomeStatus` — ikke i FIELDS

## Vurdering og anbefaling

ChatGPT-forslaget er en **stor arkitekturendring** som erstatter nåværende dataflyt. Nåværende system lagrer allerede mye av det foreslåtte, men i en flat struktur (`flight_logs` + JSONB `flight_track`). Her er en pragmatisk tilnærming:

### Anbefalt plan: Utvid eksisterende, ikke erstatt

**Steg 1: Utvid `flight_logs`-tabellen** (ny migrasjon)

Legg til kolonner som mangler — dette gir strukturert data uten å bryte eksisterende kode:

```sql
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS dronelog_sha256 text;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS start_time_utc timestamptz;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS end_time_utc timestamptz;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS total_distance_m numeric;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS max_height_m numeric;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS max_horiz_speed_ms numeric;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS max_vert_speed_ms numeric;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS drone_model text;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS aircraft_serial text;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS battery_cycles integer;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS battery_temp_min_c numeric;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS battery_temp_max_c numeric;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS battery_voltage_min_v numeric;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS gps_sat_min integer;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS gps_sat_max integer;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS rth_triggered boolean DEFAULT false;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS battery_sn text;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS battery_health_pct numeric;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS max_distance_m numeric;
ALTER TABLE flight_logs ADD COLUMN IF NOT EXISTS dronelog_warnings jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_flight_logs_sha256_company
  ON flight_logs (company_id, dronelog_sha256) WHERE dronelog_sha256 IS NOT NULL;
```

**Steg 2: Opprett `flight_events`-tabell** (ny migrasjon)

```sql
CREATE TABLE IF NOT EXISTS flight_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_log_id uuid NOT NULL REFERENCES flight_logs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id),
  t_offset_ms integer,
  type text NOT NULL,
  message text,
  raw_field text,
  raw_value text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE flight_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view flight events from own company"
  ON flight_events FOR SELECT
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Approved users can create flight events"
  ON flight_events FOR INSERT
  WITH CHECK (company_id = get_user_company_id(auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND approved = true));
```

**Steg 3: Utvid edge function FIELDS** (`process-dronelog/index.ts`)

Legg til i FIELDS-listen:
- `DETAILS.sha256Hash` — for deduplisering
- `DETAILS.guid` — unik ID
- `HOME.goHomeStatus` — RTH-deteksjon
- `OSD.goHomeStatus` — alternativ RTH
- `BATTERY.cellVoltageDeviation [V]` — cellebalanse
- `BATTERY.isVoltageLow` — lav-spenning-flagg

Utvid `parseCsvToResult` til å:
- Tracke `maxGpsSats` i tillegg til min
- Tracke `minBattTemp` i tillegg til max
- Detektere RTH-hendelser (goHomeStatus-endringer)
- Samle events med rad-offset (APP.warn-endringer, RTH, low voltage)
- Returnere `sha256Hash`, `guid`, `gpsSatMax`, `batteryTempMin`, `rthTriggered`, `events[]`

**Steg 4: Oppdater klienten** (`UploadDroneLogDialog.tsx`)

- Ved `handleCreateNew`: Lagre de nye kolonnene i `flight_logs.insert()`
- Ved `handleUpdateExisting`: Oppdater de nye kolonnene
- Etter insert: Lagre events til `flight_events`-tabellen
- Deduplisering: Sjekk `dronelog_sha256` før insert, vis melding hvis duplikat
- Utvid `DroneLogResult`-interface med nye felter

**Steg 5: Oppdater Supabase types** (`src/integrations/supabase/types.ts`)

Regenerer eller manuelt legg til de nye kolonnene i `flight_logs` og den nye `flight_events`-tabellen.

---

### Filer som endres

1. **Ny migrasjon** — Utvider `flight_logs` + oppretter `flight_events`
2. **`supabase/functions/process-dronelog/index.ts`** — Nye felter, events-deteksjon, sha256, RTH, GPS max, batt temp min
3. **`src/components/UploadDroneLogDialog.tsx`** — Deduplisering, lagre utvidede felter, lagre events
4. **`src/integrations/supabase/types.ts`** — Nye typer

### Tekniske detaljer

- Deduplisering via `DETAILS.sha256Hash`: DroneLog beregner en SHA-256-hash av hver loggfil. To opplastinger av samme fil gir identisk hash. Vi bruker en unik index på `(company_id, dronelog_sha256)` for å forhindre duplikater.
- Events samles under CSV-parsing ved å spore tilstandsendringer per rad (f.eks. `goHomeStatus` går fra tom til "GoingHome").
- RTH-deteksjon: Sjekker både `HOME.goHomeStatus` og `OSD.flycState` for go-home-relaterte tilstander.
- GPS sat max trackes ved å legge til `maxGpsSats`-variabel i parseren.
- Ingen eksisterende data brytes — alle nye kolonner er nullable.

