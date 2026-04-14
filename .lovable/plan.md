

## Plan: Automatisk daglig NOTAM-synkronisering kl 05:00

### Tilnærming
Sett opp en `pg_cron`-jobb som kaller `fetch-notams` Edge Function hver dag kl 05:00 UTC (07:00 norsk sommertid / 06:00 vintertid). Bruker `pg_net` for HTTP-kallet.

### Endringer

#### 1. Aktiver pg_cron og pg_net (hvis ikke allerede aktivert)
SQL via Supabase insert-verktøy:
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
```

#### 2. Opprett cron-jobb
SQL via Supabase insert-verktøy (ikke migrasjon, da den inneholder prosjektspesifikke verdier):
```sql
SELECT cron.schedule(
  'notam-daily-sync',
  '0 5 * * *',
  $$
  SELECT net.http_post(
    url := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/fetch-notams',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### Resultat
- NOTAMs synkroniseres automatisk kl 05:00 UTC hver dag
- Manuell "Synk nå"-knappen beholdes for on-demand-synk
- Ingen kodeendringer nødvendig — kun database-konfigurasjon

### Omfang
Minimal — kun SQL-kommandoer, ingen filendringer.

