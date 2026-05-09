-- PT-9, PT-12, PT-15: add x-cron-secret header to existing pg_cron jobs
-- so the now-hardened edge functions accept the cron call.

-- check-mission-reminders-hourly
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'check-mission-reminders-hourly'),
  command := $job$
  SELECT net.http_post(
    url := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/check-mission-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdWNzdnJ5cG9ndHR0cmFqcXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjcyMDEsImV4cCI6MjA3OTgwMzIwMX0.DMr5OjalAbZKedx0zqcTBWe5eMTrjlXIw384ycvX8dE',
      'x-cron-secret', '458cca0e6a197e843c4a1d644f9046e42494285eeb30c01887ed4439e22904cb'
    ),
    body := '{}'::jsonb
  );
  $job$
);

-- safesky-cron-refresh
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'safesky-cron-refresh'),
  command := $job$
  SELECT net.http_post(
    url := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/safesky-cron-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdWNzdnJ5cG9ndHR0cmFqcXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjcyMDEsImV4cCI6MjA3OTgwMzIwMX0.DMr5OjalAbZKedx0zqcTBWe5eMTrjlXIw384ycvX8dE',
      'x-cron-secret', '458cca0e6a197e843c4a1d644f9046e42494285eeb30c01887ed4439e22904cb'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $job$
);

-- dji-auto-sync-daily
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'dji-auto-sync-daily'),
  command := $job$
  SELECT net.http_post(
    url := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/dji-auto-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdWNzdnJ5cG9ndHR0cmFqcXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjcyMDEsImV4cCI6MjA3OTgwMzIwMX0.DMr5OjalAbZKedx0zqcTBWe5eMTrjlXIw384ycvX8dE',
      'x-cron-secret', '458cca0e6a197e843c4a1d644f9046e42494285eeb30c01887ed4439e22904cb'
    ),
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $job$
);