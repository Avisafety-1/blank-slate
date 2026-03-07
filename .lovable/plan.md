

## Plan: Lazy sync + auto-advancing sync-dato

### Problemet
Dagens auto-sync laster ned og parser *hver eneste logg* (2 API-kall per logg) selv om brukeren aldri behandler dem. Med 50 logger = 102 API-kall. I tillegg finnes ingen mekanisme for å flytte `dji_sync_from_date` fremover, så systemet risikerer å re-skanne gamle logger ved hver kjøring.

### Løsning: To endringer

**1. Lazy sync — kun metadata fra list-endepunktet**

DroneLog sin `GET /logs/{accountId}` returnerer allerede `id`, `date`, `duration`, `aircraft` per logg. Det er nok til å vise i "Logger til behandling".

I `dji-auto-sync/index.ts`:
- Fjern hele download/parse-loopen for nye logger
- For hver ny logg: lagre kun metadata i `pending_dji_logs` med `parsed_result = null`
- Felter som settes: `dji_log_id`, `flight_date` (fra `log.date`), `duration_seconds` (fra `log.duration`), `aircraft_name` (fra `log.aircraft`), `status = 'pending'`
- Behold `dji_log_id`-deduplisering (allerede på plass)
- Fjern SHA-256-sjekk ved sync (den skjer ikke lenger siden vi ikke parser)

**Resultat**: Fra ~102 til ~2 API-kall per bruker per sync.

**2. On-demand parsing når brukeren klikker en logg**

I `handleSelectPendingLog` (UploadDroneLogDialog.tsx):
- Når `parsed_result` er `null`: vis loading-state, kall en ny edge-funksjon (`dji-process-single`) som gjør login + download + parse for denne ene loggen
- Lagre resultatet tilbake i `pending_dji_logs.parsed_result`
- Fortsett med eksisterende flyt (match drone/batteri, vis resultat)

Ny edge-funksjon `dji-process-single/index.ts`:
- Tar inn `pending_log_id` + brukerens auth
- Henter credentials fra `dji_credentials`, logger inn, laster ned og parser den ene loggen
- Oppdaterer `pending_dji_logs` med `parsed_result`, `matched_drone_id`, `matched_battery_id`
- Returnerer parsed result til klienten

**3. Auto-advancing sync-dato**

I `dji-auto-sync/index.ts`, etter at alle logger for en bruker er behandlet:
- Finn den nyeste `log.date` blant alle hentede logger
- Oppdater `companies.dji_sync_from_date` til denne datoen
- Da starter neste sync kun fra dette tidspunktet — aldri bakover

**4. UI-endringer i PendingDjiLogsSection**

- Vis metadata-logger (dato, varighet, dronemodell) fra list-info — allerede fungerer med eksisterende felter
- Ingen endring nødvendig siden `aircraft_name`, `flight_date`, `duration_seconds` allerede vises

**5. UI-endringer i UploadDroneLogDialog**

- I `handleSelectPendingLog`: når `parsed_result === null`, vis Loader2 + "Henter flydata..." og kall `dji-process-single`
- Etter suksess, fortsett som før med `setResult(data)` og `setStep('result')`

### API-kall-sammenligning

```text
                    Nå              Etter
Sync (50 logger):   102 kall        2 kall
Behandle 1 logg:    0 kall          2 kall
Behandle 10 av 50:  102 kall        22 kall
```

### Filer som endres
1. `supabase/functions/dji-auto-sync/index.ts` — fjern download/parse, lagre kun metadata, oppdater `dji_sync_from_date` etter sync
2. `supabase/functions/dji-process-single/index.ts` — ny edge-funksjon for on-demand parsing av én logg
3. `supabase/config.toml` — registrer ny funksjon med `verify_jwt = false`
4. `src/components/UploadDroneLogDialog.tsx` — kall `dji-process-single` når `parsed_result` mangler

