## Planlegg currency-status cron til ~07:00 norsk tid

Edge-funksjonen `check-currency-status` er allerede deployet. Mangler bare cron-schedule (forrige forsøk på `30 7 * * *` ble avbrutt — og den slottet er uansett opptatt-nær).

### Valgt tidspunkt: `30 5 * * *` UTC

- 06:30 norsk tid om vinteren
- 07:30 norsk tid om sommeren
- Snitt ≈ kl. 07:00 lokalt, som ønsket
- Ingen konflikt med eksisterende jobber (07:00/07:10/07:20 UTC, hver 15. min, hver time o.l.)

### Endring

Kjør via `pg_cron` (samme mønster som `check-competency-expiry-daily` osv.):

```sql
select cron.schedule(
  'check-currency-status-daily',
  '30 5 * * *',
  $$
  select net.http_post(
    url:='https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/check-currency-status',
    headers:='{"Content-Type":"application/json","apikey":"<anon key>"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);
```

Ingen kodeendringer i frontend eller edge-funksjon. Kun ny cron-schedule.