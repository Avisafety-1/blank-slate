# «Sync nå» henter loggene med én gang

I dag legger «Sync nå» bare loggene i kø, og køen tømmes først i nattvinduet (fra kl. 23 norsk tid). Derfor ser piloten loggene som «allerede behandlet med auto-sync», men finner dem ikke i listen. Etter denne endringen henter «Sync nå» loggene med én gang, mens du ser på.

## Slik skal det fungere

1. Du trykker «Sync nå».
2. Systemet henter listen fra DJI-kontoen og finner de nyeste loggene som ikke allerede er hentet — nøyaktig samme dobbeltsjekk som i dag (samme logg-ID, samme fil-signatur, allerede ferdigbehandlede flyturer og logger som ligger til behandling hoppes over).
3. De nyeste **20** loggene som mangler behandles fortløpende, én etter én, med en teller i dialogen: «Henter logg 4 av 12 …».
4. Ferdige logger dukker opp i listen «til behandling» underveis — du trenger ikke vente til alt er ferdig.
5. Er det flere enn 20 igjen, avsluttes kjøringen med «12 logger hentet – 7 gjenstår» og en knapp «Hent flere», som kjører neste pulje.
6. Nattkjøringen beholdes som sikkerhetsnett for alt som ikke ble tatt manuelt.

**Hvorfor 20 og ikke alt?** Hver logg må lastes ned og tolkes (typisk 3–10 sekunder). 20 logger tar rundt 1–3 minutter, som er greit å vente på. Å ta «alt» kan bety hundrevis av logger første gang en konto kobles til, og da ville dialogen stått og malt i en halvtime. Grensen gjelder per trykk, og «Hent flere» gjør resten tilgjengelig.

## Feil og grensetilfeller

- Blir DJI-kontoen midlertidig sperret (for mange forsøk), stopper kjøringen pent med en tydelig melding, og de gjenværende loggene blir liggende i kø til natten.
- Enkeltlogger som ikke lar seg tolke merkes som før («kan ikke leses automatisk») og stopper ikke resten.
- Lukker du dialogen midt i, fortsetter ikke kjøringen — men ingenting går tapt; resten ligger fortsatt i kø.
- Logger som ligger i kø skal ikke lenger blokkere manuell opplasting av samme fil.

## Teknisk

- Ny edge-funksjon `dji-sync-now` (JWT, kun for egen bruker; ingen cron-secret):
  - Steg 1: kaller samme kø-logikk som `dji-sync-enqueue` for innlogget bruker (uendret dedupe: `dji_log_id`, signatur mot `pending_dji_logs` og `flight_logs`, `dji_sync_from_date`).
  - Steg 2: klaimer og prosesserer **inntil 2 jobber per kall** for denne brukeren ved å gjenbruke `processJob`-logikken fra `dji-sync-worker`. Denne flyttes til `supabase/functions/_shared/dji-sync-job.ts` slik at worker og «Sync nå» deler nøyaktig samme kode.
  - Returnerer `{ processed, done, failed, remaining, rate_limited }`.
- `claim_dji_sync_jobs` brukes ikke direkte (den er global). Legger til RPC `claim_dji_sync_jobs_for_user(_user_id uuid, _limit int)` med samme `FOR UPDATE SKIP LOCKED`-mønster, slik at nattkjøringen og manuell kjøring ikke kolliderer. Dette er eneste databaseendring (en ny funksjon, ingen tabellendring).
- Frontend `UploadDroneLogDialog.tsx`: «Sync nå» bytter fra `dji-auto-sync` til en løkke mot `dji-sync-now` — maks 10 runder (20 logger), avbrytes ved `rate_limited` eller `remaining === 0`. Progresjonstekst og korrekt toast basert på faktiske tall (dagens toast leser `data.synced`, som køleggingen aldri returnerer). `pendingLogsRef.current?.refresh()` kalles etter hver runde.
- `process-dronelog`: logger med status `queued`/`pending` i `dji_sync_jobs` skal ikke lenger gråes ut som «allerede behandlet» — kun logger som faktisk finnes i `pending_dji_logs` eller `flight_logs` merkes.
- Alle nye brukertekster legges i `no.json` og `en.json`.
