
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove previous schedule if it exists (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('sync-caa-drone-zones-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'sync-caa-drone-zones-daily',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/sync-caa-drone-zones',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdWNzdnJ5cG9ndHR0cmFqcXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjcyMDEsImV4cCI6MjA3OTgwMzIwMX0.DMr5OjalAbZKedx0zqcTBWe5eMTrjlXIw384ycvX8dE',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SHARED_SECRET' LIMIT 1)
    ),
    body := jsonb_build_object('trigger', 'cron', 'time', now())
  );
  $$
);
