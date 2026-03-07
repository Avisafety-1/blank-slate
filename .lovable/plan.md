

## Plan: Full download/parse under auto-sync, filtrert av sync-dato

### Endring
Gjeninnfør nedlasting og parsing i `dji-auto-sync` slik at logger behandles ferdig ved sync — men kun for logger nyere enn `dji_sync_from_date`. Dato-filteret og auto-advancing er allerede på plass, så dette er trygt mot re-skanning.

### Hva endres

**`supabase/functions/dji-auto-sync/index.ts`**
- Etter at en ny logg passerer dato-filteret og dedupliserings-sjekken, legg til:
  1. Download logfilen via `GET /logs/{accountId}/{logId}/download`
  2. Upload + parse via DroneLog (gjenbruk `uploadAndParse`-logikken fra `dji-process-single`)
  3. Auto-match drone/batteri via serienummer
  4. SHA-256 deduplisering mot `flight_logs`
  5. Lagre ferdig parset resultat i `pending_dji_logs` med `parsed_result`, `aircraft_sn`, `matched_drone_id`, `matched_battery_id` osv.
- Importer `JSZip` og legg til CSV-parser + upload-hjelpefunksjoner (kopier fra `dji-process-single`)
- Behold rate-limit-håndtering (429) — bryt ut av loopen ved throttling

**`dji-process-single`** beholdes uendret som fallback for logger der `parsed_result` er null (f.eks. eldre metadata-only rader).

### API-kall per sync (med dato-filter)
Siden sync-datoen avanserer til nyeste logg etter hver kjøring, vil neste sync typisk bare se 0-5 nye logger:
- 2 faste kall (login + list) + 2 per ny logg (download + parse)
- 5 nye logger = 12 kall totalt — akseptabelt

### Filer
1. `supabase/functions/dji-auto-sync/index.ts` — legg til download/parse-logikk, CSV-parser, JSZip, drone/batteri-matching, SHA-256 dedup
2. Redeploy edge function

