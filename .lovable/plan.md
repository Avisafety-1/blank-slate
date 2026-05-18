## Problem

Cron-jobben `sync-dk-drone-zones-daily` er registrert (jobid 43, schedule `30 4 * * *`), men:

1. **Cron kjører ikke umiddelbart** — den venter til neste 04:30 UTC. `cron.schedule` registrerer bare planen.
2. Tabellene `dk_drone_zones` og `dk_nature_areas` er fortsatt tomme (0 rader).
3. Edge function-loggene viser kun "booted" + "shutdown" — ingen sync har kjørt enda.

## Løsning: kjør initial-synk manuelt nå

Kjør denne SQL-en i Supabase SQL Editor for å trigge edge-funksjonen umiddelbart (samme oppsett som den fungerende CAA-cron-en):

```sql
SELECT net.http_post(
  url := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/sync-dk-drone-zones',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdWNzdnJ5cG9ndHR0cmFqcXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjcyMDEsImV4cCI6MjA3OTgwMzIwMX0.DMr5OjalAbZKedx0zqcTBWe5eMTrjlXIw384ycvX8dE',
    'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SHARED_SECRET' LIMIT 1)
  ),
  body := jsonb_build_object('trigger', 'manual', 'time', now())
);
```

## Etter kjøring

Jeg sjekker selv at:
- `dk_drone_zones` og `dk_nature_areas` fylles opp
- Edge-funksjons-loggene viser successful upserts
- Cron-jobben kjører automatisk neste natt 04:30 UTC

## Hvis det fortsatt ikke virker

Da må vi verifisere at `CRON_SHARED_SECRET` finnes i Vault (`SELECT name FROM vault.secrets` returnerte tomt nå). Hemmeligheten er satt som edge function secret, men `vault.decrypted_secrets`-oppslaget i cron-kommandoen kan returnere NULL hvis den ikke ligger i Vault-tabellen. Da legger jeg den til via en migrasjon, eller bytter cron-headeren til å bruke en direkte streng.
