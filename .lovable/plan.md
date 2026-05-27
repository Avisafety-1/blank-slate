## Status fra loggene

Ja, opplastingen din fungerte. Job `5939e4df…` ble fullført på **7.4 s** (download 810 ms, parser 6251 ms, normalize 25 ms, insert 290 ms), og worker bootet kun **~1 s etter** at `ardupilot-enqueue` kjørte. Fire-and-forget-triggeren fungerer altså allerede, men UX-en signaliserer "lagt i kø, vent" som skaper inntrykk av forsinkelse. Cron-jobben (hver 2. minutt) er bare en backstop hvis fire-and-forget skulle feile.

## Hva som skal endres

### 1. ArduPilot-spesifikke toasts og oppdragstitler

- I `UploadDroneLogDialog.tsx`:
  - Erstatt enkelttoasten "Logg lagt i kø…" med en ArduPilot-spesifikk melding:
    "ArduPilot-logg lastet opp. Behandling startet – dukker opp under 'Ventende flylogger' om noen sekunder."
  - Bulk-flyt: skille tekst per filtype (ArduPilot vs DJI) i sluttoppsummeringen og i `droneModel`-feltet (bruk filnavnet i stedet for "ArduPilot (i kø)").
  - "Flylogg oppdatert med DJI-data!" (linje 1766) → bruk samme `source === 'ardupilot'` mønster som linje 1840 (`ArduPilot`/`DJI`).
  - Pass på at `result.source` faktisk er satt når en pending log lastes inn fra DB (sett `(result as any).source = 'ardupilot'` hvis `pendingLog.parsed_result.source === 'ardupilot'` eller `source_file_type === 'ardupilot'`). Dette sikrer at oppdragstittel og notater bruker "ArduPilot-flylogg …" i alle tre handlerne (`handleUpdateExisting`, `handleCreateNew`, `handleLinkToMission`).

- I `PendingDjiLogsSection.tsx`:
  - Vis "ArduPilot" som type-badge når raden har `source_file_type === 'ardupilot'` eller `parsed_result.source === 'ardupilot'` (i dag står det implisitt DJI).
  - ArduPilot-spesifikke feilmeldingstekster der `error_code` ikke gir mening for ArduPilot (rate_limit/login_failed/download_failed er DJI-spesifikke).
  - Selve seksjonstittelen "Ventende flylogger fra auto-sync" beholdes – den dekker begge.

### 2. Umiddelbar prosessering ved enkeltopplasting

Fire-and-forget-trigger fungerer allerede (loggene bekrefter det), men gjør den mer robust og synlig for brukeren:

- I `UploadDroneLogDialog.tsx`:
  - Etter et vellykket `ardupilot-enqueue`-kall, åpne dialogen i en "behandler…"-tilstand i stedet for å lukke. Poll `pending_dji_logs` på `dji_log_id = 'ardu:<storage_path>'` (eller `ardupilot_parse_jobs.id`) hvert 1.5 s i opptil 30 s.
  - Når raden dukker opp: lukk dialogen, vis toast "ArduPilot-logg klar til behandling – velg den i listen", og kall `pendingLogsRef.current?.refresh()`.
  - Hvis polling timer ut: vis toast "Loggen ligger i kø og blir behandlet i bakgrunnen (sjekk igjen om kort tid)" og lukk dialogen.
  - Bulk-flyt beholder dagens fire-and-forget oppførsel uten polling (for å unngå at brukeren venter på N filer i UI).

- I `ardupilot-enqueue/index.ts`:
  - Behold fire-and-forget, men logg eksplisitt om `CRON_SHARED_SECRET` mangler (`console.warn`) slik at vi ser hvis triggeren stille blir hoppet over.
  - Returner `{ job_id, status, syntheticLogId }` slik at frontend vet hvilken `pending_dji_logs.dji_log_id` den skal polle på.

### 3. Ikke endringer

- Cron-jobben (hvert 2. minutt) beholdes som backstop – den er ikke det som behandler enkeltopplastinger normalt.
- Worker-arkitektur, batch size, retry-logikk, RLS og storage-policies forblir uendret.
- DJI-flyten røres ikke.

## Tekniske detaljer

- Polling-nøkkel: bruk `dji_log_id = 'ardu:' + storage_path` (allerede satt av worker) – matcher entydig.
- `syntheticLogId` returneres fra `ardupilot-enqueue` for å unngå at frontend må gjenta path-konstruksjonen.
- Eksisterende `(result as any)?.source === 'ardupilot'`-mønster brukes konsekvent; vi setter `source` på `result` rett etter at det leses fra `pendingLog.parsed_result`.
- Ingen DB-migrasjoner. Ingen endring i `_shared/ardupilot-normalize.ts`. Ingen endring i `ardupilot-sync-worker`.

## Filer som endres

- `src/components/UploadDroneLogDialog.tsx` (toast-tekster, polling etter enqueue, sett `result.source`)
- `src/components/PendingDjiLogsSection.tsx` (ArduPilot-badge + feilmeldingsmapping)
- `supabase/functions/ardupilot-enqueue/index.ts` (logge manglende cron-secret, returnere `syntheticLogId`)
