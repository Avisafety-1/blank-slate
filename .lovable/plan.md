## Mål
Vise på `/status` hvor stor andel av flygingen som har vært VLOS / BVLOS / EVLOS — basert utelukkende på en velger i "Avslutt flyging"-dialogen (`LogFlightTimeDialog`). Default verdi: **VLOS**.

## 1. Datamodell
Ny kolonne på `flight_logs`:

```
operation_type text NOT NULL DEFAULT 'VLOS'
  CHECK (operation_type IN ('VLOS','BVLOS','EVLOS'))
```

Indeks: `(company_id, operation_type, flight_date)` for raske aggregeringer.

Backfill: alle eksisterende rader settes til `'VLOS'` (per din regel — velgeren er eneste sannhet, og default er VLOS).

Ingen auto-utleding fra `missions.notam_operation_type` eller `mission_risk_assessments` — som du ba om.

## 2. UI — `LogFlightTimeDialog`
Legg til en `RadioGroup` (eller `Select`) "Operasjonstype" med tre valg: VLOS / BVLOS / EVLOS. Default `VLOS`. Verdi sendes med på begge `insert`-stedene (linje ~620 og ~752 i `LogFlightTimeDialog.tsx`).

`EditFlightLogDialog` får samme felt slik at administratorer kan korrigere historiske flyturer.

Ingen endringer i `StartFlightDialog`, NOTAM-flyt, risikovurdering eller importflyter — disse leverer ikke verdien.

## 3. Statistikk-seksjon på `/status`
Ny kortgruppe "Operasjonstype" i operasjonell visning:

- **Donut**: andel flyturer per type i valgt periode.
- **KPI**: `X timer VLOS (Y%)` / `Z timer BVLOS (W%)` / `Q timer EVLOS (R%)` basert på `flight_duration_minutes`.
- **Stablet søylediagram per måned** (gjenbruker `getMonthsToShow()` og periodefilter som finnes).

Ny `fetchOperationTypeStatistics()` i `Status.tsx`:
```ts
supabase
  .from('flight_logs')
  .select('operation_type, flight_duration_minutes, flight_date')
  .gte('flight_date', startDate.toISOString().slice(0,10))
  .lte('flight_date', endDate.toISOString().slice(0,10));
```
Aggregeres client-side. Eksport til Excel/PDF utvides med samme tall (følger eksisterende mønster i `handleExportExcel`/PDF).

## Filer som endres
- `supabase/migrations/<ny>.sql` — kolonne, CHECK, indeks, backfill av eksisterende rader til `'VLOS'`.
- `src/components/LogFlightTimeDialog.tsx` — nytt felt + verdi i begge `insert`.
- `src/components/EditFlightLogDialog.tsx` — nytt felt for korrigering.
- `src/pages/Status.tsx` — ny seksjon, ny fetch, eksport-utvidelse.

## Effekt
Alle eksisterende flyturer vises som VLOS i grafen (default). Fra og med denne endringen styres statistikken 100 % av valget piloten gjør i avslutt-dialogen.
