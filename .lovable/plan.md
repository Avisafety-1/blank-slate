

## Bulk-opplasting: Lagre til behandlingskø + tillat lukking

### Problem
1. Bulk-opplastede filer lagres direkte i `flight_logs` — bør i stedet havne i `pending_dji_logs` (behandlingskøen) slik at brukeren kan se over og godkjenne dem
2. Dialogen bør kunne lukkes under prosessering, men prosessen skal fortsette i bakgrunnen

### Løsning

**Fil: `src/components/UploadDroneLogDialog.tsx`**

**1. Endre `handleBulkUpload` til å lagre i `pending_dji_logs` i stedet for `flight_logs`:**
- Fjern steg 5-7 (mission-opprettelse, flight_log-lagring, personnel/equipment-linking)
- For hver fil: parse via edge function → SHA-256 duplikatsjekk (mot både `pending_dji_logs.dji_log_id` og `flight_logs.dronelog_sha256`) → auto-match drone → lagre i `pending_dji_logs` med:
  - `dji_log_id`: SHA-256 hash (for dedup)
  - `aircraft_name`, `aircraft_sn`, `flight_date`, `duration_seconds`, `max_height_m`, `total_distance_m`
  - `matched_drone_id`, `matched_battery_id`
  - `parsed_result`: hele DroneLogResult-objektet
  - `status: 'pending'`
- Oppdater resultat-tabellens statusvisning til «Lagt til behandlingskø» i stedet for «Lagret»

**2. Tillat lukking under prosessering:**
- Bruk en `useRef` for å holde prosesseringsstate slik at async-løkken fortsetter selv om dialogen lukkes
- Når dialogen lukkes under prosessering: vis en toast «Prosessering fortsetter i bakgrunnen»
- Når prosessen er ferdig (uavhengig av om dialogen er åpen): refresh `PendingDjiLogsSection` via `pendingLogsRef.current?.refresh()` og vis toast med oppsummering

**3. Refresh behandlingskøen:**
- Etter bulk er ferdig, kall `pendingLogsRef.current?.refresh()` for å oppdatere «Logger til behandling»-listen
- Brukeren ser de nye loggene umiddelbart når de åpner dialogen igjen

### Resultat
Bulk-filer havner i behandlingskøen der brukeren kan koble dem til riktig oppdrag og godkjenne — konsistent med DJI Cloud-synkroniseringsflyten. Dialogen kan trygt lukkes uten å avbryte prosessering.

