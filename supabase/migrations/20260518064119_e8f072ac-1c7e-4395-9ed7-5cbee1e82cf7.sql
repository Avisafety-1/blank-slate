-- Trigger one-time initial sync for DK drone zones
DO $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SHARED_SECRET' LIMIT 1;
  PERFORM net.http_post(
    url := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/sync-dk-drone-zones',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdWNzdnJ5cG9ndHR0cmFqcXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjcyMDEsImV4cCI6MjA3OTgwMzIwMX0.DMr5OjalAbZKedx0zqcTBWe5eMTrjlXIw384ycvX8dE',
      'x-cron-secret', COALESCE(v_secret, '')
    ),
    body := jsonb_build_object('trigger', 'manual-initial', 'time', now())
  );
END $$;