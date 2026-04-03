

## Slett gamle cron-jobblogger

### Problem
`cron.job_run_details` inneholder **2.7 millioner rader** og tar **5 GB** lagringsplass. Disse loggene har ingen nytteverdi etter kort tid.

### Løsning
Legge til en ny cron-jobb som kjører daglig og sletter logger eldre enn 7 dager.

### Implementasjon

**Kjøre SQL direkte** (ikke via migrasjon, da dette inneholder prosjekt-spesifikke nøkler):

```sql
-- 1. Slett alle eksisterende gamle logger umiddelbart
DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';

-- 2. Opprett daglig opprydningsjobb
SELECT cron.schedule(
  'cleanup-cron-logs',
  '0 4 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$$
);
```

### Detaljer
- Kjører kl. 04:00 hver dag
- Beholder de siste 7 dagenes logger for debugging
- Første kjøring vil frigjøre ~5 GB

### Filer som endres
Ingen kodeendringer — kun SQL som kjøres mot databasen.

