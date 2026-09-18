# Rydde opp i ventende DJI-logger uten å miste noe

## Svar på spørsmålene dine

Ja, kommandoen i skjermbildet er riktig og trygg: `VACUUM FULL` på TOAST-delen frigjør bare død plass etter allerede slettede/oppdaterte rader. Ingen rader forsvinner. (Merk: den låser tabellen mens den kjører, så kjør den utenom arbeidstid, alene i sin egen kjøring.)

Men den løser ikke årsaken. Slik ser tabellen ut nå:

| Tilstand | Antall | Plass |
|---|---|---|
| Venter på behandling | 2 498 | 104 MB |
| Godkjent (allerede lagt inn som flytur) | 1 749 | 142 MB |
| Avvist | 263 | 6 MB |
| Ikke støttet | 1 | ~0 |

Tabellen blåser seg opp fordi hver rad lagrer hele det tolkede loggresultatet (full telemetri, ca. 40–80 kB per flyging), og **ingenting sletter det noen gang** — heller ikke etter at loggen er godkjent og flyturen er opprettet. Det finnes ingen opprydningsjobb for denne tabellen i dag.

Ingen ventende logger røres i denne planen.

## Hva som gjøres

1. **Frigjør plass fra ferdigbehandlede logger.** For godkjente rader der flyturen finnes og har lagret flysporet, tømmes det tunge tolkningsresultatet. Selve raden beholdes (dato, dronenavn, serienummer, status, kobling til flyturen), så historikk og duplikatsjekk er intakt. 43 godkjente rader mangler flytur (flyturen er slettet) — disse røres ikke.
2. **Avviste logger** beholdes som rad, men det tunge tolkningsresultatet tømmes etter 30 dager.
3. **Ventende logger beholdes urørt** — alltid. Ingen automatikk skal noen gang slette eller tømme en rad som venter på behandling.
4. **Fast opprydning** legges inn som en daglig jobb (nattestid) som gjør punkt 1 og 2 løpende, slik at tabellen holder seg liten av seg selv.
5. **Varsling om etterslep:** 2 498 ventende logger, de eldste fra mars, tyder på at mange aldri blir behandlet. Vi legger inn en oversikt til administrator over hvor mange ventende logger selskapet har, og hvor gamle de er, slik at de kan tas unna. Ingen sletting.
6. **Etterpå** kjører du `VACUUM FULL` i Supabase-editoren for faktisk å frigjøre diskplassen.

Forventet resultat: tabellen går fra ca. 268 MB til rundt 100 MB, og holder seg der.

## Teknisk

- Ny funksjon `public.cleanup_pending_dji_logs()` (SECURITY DEFINER, med eksplisitt `REVOKE EXECUTE FROM anon, authenticated, PUBLIC`):
  - `UPDATE pending_dji_logs SET parsed_result = NULL WHERE status='approved' AND parsed_result IS NOT NULL AND processed_flight_log_id IN (SELECT id FROM flight_logs WHERE flight_track IS NOT NULL)`
  - samme for `status='dismissed' AND created_at < now() - interval '30 days'`
  - aldri `status='pending'`
  - kjøres i porsjoner (f.eks. 500 rader per runde) for å unngå lange låser
- `pg_cron`-jobb `cleanup-pending-dji-logs` kl. 03:40 daglig (én gang i døgnet holder — dette er ren vedlikeholdsrydding, ikke tidskritisk).
- Etterpå, manuelt i SQL-editoren (låser tabellen, kan ikke kjøres i migrasjon):
  ```sql
  VACUUM FULL pg_toast.pg_toast_133026;
  VACUUM FULL ANALYZE public.pending_dji_logs;
  ```
- Ingen endring i opplastings-, tolknings- eller godkjenningsflyten. `PendingDjiLogsSection` henter kun `status='pending'` og påvirkes ikke.
