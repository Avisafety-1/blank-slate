

# Automatisk DJI-logg-sync per selskap

## Oversikt

Legge til en "Automatisk sync"-bryter i DJI-innloggingsseksjonen i `UploadDroneLogDialog`, pluss en superadmin-kontroll per selskap i `CompanyManagementSection` for å aktivere/deaktivere auto-sync og sette startdato.

Synkroniserte logger havner i en ny `pending_dji_logs`-tabell som brukerne behandler manuelt (velge drone, pilot, oppdrag etc.) via en ny dialog.

## Arkitektur

```text
Superadmin (CompanyManagementSection)
  └─ Aktiverer "Auto-sync" per selskap + setter sync_from-dato
       ↓
companies.dji_auto_sync_enabled = true
companies.dji_sync_from_date = '2025-01-01'
       ↓
Edge function: sync-dji-logs (cron daglig)
  ├─ For hvert selskap med auto-sync aktivert:
  │   ├─ Hent alle dji_credentials for selskapet
  │   ├─ Auto-login → list logs (etter sync_from_date)
  │   ├─ Dedupliser mot pending_dji_logs + flight_logs (SHA/log-ID)
  │   ├─ For nye logger: process via DroneLog API
  │   ├─ Auto-match drone/batteri via serienummer
  │   └─ Insert i pending_dji_logs med status='pending'
  └─ Oppdater last_sync_at

Bruker (UploadDroneLogDialog / ny PendingDjiLogsDialog)
  ├─ Ser badge med antall ventende logger
  ├─ Åpner dialog → ser liste over ventende logger
  ├─ Velger drone, pilot, utstyr, oppdrag
  └─ Lagrer → oppretter flight_log + oppdrag
```

## Database-endringer

### 1. Nye kolonner på `companies`
- `dji_auto_sync_enabled` (boolean, default false)
- `dji_sync_from_date` (date, nullable) -- hvor langt tilbake i tid

### 2. Ny kolonne på `dji_credentials`
- `last_sync_at` (timestamptz, nullable)

### 3. Ny tabell `pending_dji_logs`

| Kolonne | Type |
|---|---|
| id | uuid PK |
| company_id | uuid FK companies |
| user_id | uuid FK auth.users |
| dji_log_id | text NOT NULL |
| aircraft_name | text |
| aircraft_sn | text |
| flight_date | timestamptz |
| duration_seconds | integer |
| max_height_m | real |
| total_distance_m | real |
| parsed_result | jsonb |
| matched_drone_id | uuid FK drones |
| matched_battery_id | uuid FK equipment |
| status | text DEFAULT 'pending' |
| processed_flight_log_id | uuid |
| error_message | text |
| created_at | timestamptz |

- Unik: `(company_id, dji_log_id)`
- RLS: brukere ser kun egne selskapets logger

## Edge function: `sync-dji-logs`

Ny edge function som:
1. Henter alle selskaper med `dji_auto_sync_enabled = true` og `dronelog_api_key IS NOT NULL`
2. For hvert selskap: henter alle `dji_credentials` (med company join via profiles)
3. Dekrypterer passord, logger inn via DroneLog API
4. Lister logger (filtrert etter `dji_sync_from_date` og `last_sync_at`)
5. For nye logger: prosesserer via DroneLog API (gjenbruker parseCsvToResult-logikken fra process-dronelog)
6. Auto-matcher drone/batteri via serienummer mot selskapets ressurser
7. Inserter i `pending_dji_logs`
8. Oppdaterer `last_sync_at` på `dji_credentials`

Registreres med `verify_jwt = false` for cron-bruk.

## Frontend-endringer

### 1. `CompanyManagementSection.tsx`
- Legg til "Auto-sync" Switch + DatePicker for `dji_sync_from_date` ved siden av eksisterende DJI-bryter
- Kun synlig for superadmins på selskaper med `dji_flightlog_enabled = true`

### 2. `UploadDroneLogDialog.tsx`
- Under "Husk innlogging" (linje ~1505-1514): legg til info om auto-sync status hvis aktivert for selskapet
- Vis badge/lenke til ventende logger hvis det finnes noen

### 3. Ny komponent: `PendingDjiLogsDialog.tsx`
- Liste over ventende logger med dato, drone, varighet
- For hver logg: velg/bekreft drone, pilot, utstyr, oppdrag (gjenbruk eksisterende mønstre fra UploadDroneLogDialog)
- "Behandle" → oppretter flight_log, mission etc. (extrahert save-logikk)
- "Hopp over" → sett status='skipped'

### 4. `Header.tsx` eller Dashboard
- Badge med antall pending logs for selskapet

### 5. Ny helper: `src/lib/flightLogSave.ts`
- Ekstraher save-logikken fra UploadDroneLogDialog (handleCreateNew, handleLinkToMission) til en delt funksjon
- Brukes av både UploadDroneLogDialog og PendingDjiLogsDialog

## Implementasjonsrekkefølge

Pga. omfanget deles dette i 3 steg:

**Steg 1**: Database (pending_dji_logs-tabell + nye kolonner) + Admin UI for aktivering per selskap

**Steg 2**: Edge function `sync-dji-logs` med full sync-logikk

**Steg 3**: Frontend - PendingDjiLogsDialog + badge + refaktorert save-logikk

