# Rydde opp i ventende DJI-logger uten å miste analysedata

## Svar på spørsmålene dine

**Er kommandoen i skjermbildet riktig?** Ja, den er trygg. `VACUUM FULL` frigjør bare død plass etter allerede slettede/oppdaterte rader — ingen rader forsvinner. Den låser tabellen mens den kjører, så den bør kjøres utenom arbeidstid, alene.

**Mister vi ferdigbehandlede logger til analyse?** Nei. Jeg har sjekket: flyanalysen i Avisafe (kart, 3D, batteri, stikker, hendelser) leser utelukkende fra selve **flyturen** — flysporet og alle nøkkeltall (hastigheter, høyde, batteritemperatur/spenning/sykluser, GPS, RTH, hash) er lagret permanent der. Ventetabellen er kun en mellomstasjon fram til loggen er godkjent; etter godkjenning blir det tolkede råresultatet der aldri lest av analysen.

**Hvorfor blåser tabellen seg opp?** Hver rad lagrer hele det tolkede loggresultatet (full telemetri, ca. 40–80 kB per flyging), og **ingenting rydder det noen gang** — heller ikke etter godkjenning. Det finnes ingen opprydningsjobb for denne tabellen i dag.

| Tilstand | Antall | Plass |
|---|---|---|
| Venter på behandling | 2 498 | 104 MB |
| Godkjent (allerede lagt inn som flytur) | 1 749 | 142 MB |
| Avvist | 263 | 6 MB |

## Hva som gjøres

1. **Ventende logger røres aldri.** Ingen automatikk skal noen gang slette eller tømme en rad som venter på behandling. Brukere beholder alt de har til behandling.
2. **Godkjente logger:** raden beholdes for alltid (dato, dronenavn, serienummer, filnavn, hash, status, kobling til flyturen) — bare den tunge råtelemetrien fjernes, og kun når flyturen finnes og faktisk har lagret flysporet. 43 godkjente rader der flyturen er slettet røres ikke.
3. **Avviste logger:** raden beholdes, råtelemetrien fjernes etter 30 dager.
4. **Duplikatsikring beholdes.** Hash og filnavn blir liggende igjen på raden, så gjenimport av samme logg fanges fortsatt opp.
5. **Fast nattlig opprydning** slik at tabellen holder seg liten av seg selv framover.
6. **Etterslepet synliggjøres:** 2 498 ventende logger, de eldste fra mars. Administrator får en teller over antall og alder på ventende logger, slik at de kan tas unna. Ingen sletting.
7. **Etterpå** kjører du `VACUUM FULL` i Supabase-editoren for faktisk å frigjøre diskplassen.

Forventet resultat: tabellen går fra ca. 268 MB til rundt 100 MB, og holder seg der.

## Teknisk

- Ny funksjon `public.cleanup_pending_dji_logs()` (SECURITY DEFINER, med eksplisitt `REVOKE EXECUTE FROM anon, authenticated, PUBLIC`, `GRANT` kun til `service_role`/`postgres`):
  - Erstatter `parsed_result` med en slank versjon i stedet for `NULL`, så dedup-spørringen `parsed_result->>sha256Hash` i `_shared/dji-sync-job.ts` fortsatt virker:
    ```sql
    jsonb_build_object(
      'sha256Hash', parsed_result->>'sha256Hash',
      'djiFileName', parsed_result->>'djiFileName',
      'aircraftName', parsed_result->>'aircraftName',
      'aircraftSN',  parsed_result->>'aircraftSN',
      'source',      parsed_result->>'source',
      'slimmed',     true)
    ```
  - Betingelser: `status='approved' AND parsed_result ? 'sha256Hash' IS NOT FALSE AND NOT (parsed_result->>'slimmed')::bool IS TRUE AND processed_flight_log_id IN (SELECT id FROM flight_logs WHERE flight_track IS NOT NULL)`; samt `status='dismissed' AND created_at < now() - interval '30 days'`.
  - Aldri `status='pending'`, aldri `status='unsupported'`.
  - Kjøres i porsjoner (500 rader per runde) for å unngå lange låser.
- `pg_cron`-jobb `cleanup-pending-dji-logs`, én gang i døgnet kl. 03:40 — ren vedlikeholdsrydding, ikke tidskritisk, så daglig er nok og gir minimal databasebelastning.
- Etterslep-teller i `PendingDjiLogsSection`: antall ventende og alder på eldste, via eksisterende spørring. Ingen ny tabell.
- Etterpå, manuelt i SQL-editoren (låser tabellen, kan ikke kjøres i migrasjon):
  ```sql
  VACUUM FULL pg_toast.pg_toast_133026;
  VACUUM FULL ANALYZE public.pending_dji_logs;
  ```
- Ingen endring i opplastings-, tolknings- eller godkjenningsflyten. `PendingDjiLogsSection` og `BatchLogPanel` henter kun `status='pending'`.
