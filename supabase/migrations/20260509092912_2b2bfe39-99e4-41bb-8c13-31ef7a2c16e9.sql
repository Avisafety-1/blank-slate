DO $$
DECLARE
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdWNzdnJ5cG9ndHR0cmFqcXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjcyMDEsImV4cCI6MjA3OTgwMzIwMX0.DMr5OjalAbZKedx0zqcTBWe5eMTrjlXIw384ycvX8dE';
  cron_secret text := '458cca0e6a197e843c4a1d644f9046e42494285eeb30c01887ed4439e22904cb';
BEGIN
  PERFORM cron.unschedule('check-document-expiry-daily');
  PERFORM cron.schedule('check-document-expiry-daily', '0 7 * * *', format($f$
    SELECT net.http_post(
      url := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/check-document-expiry',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer %s',
        'x-cron-secret','%s'
      ),
      body := '{}'::jsonb
    );
  $f$, anon_key, cron_secret));

  PERFORM cron.unschedule('check-maintenance-expiry-daily');
  PERFORM cron.schedule('check-maintenance-expiry-daily', '20 7 * * *', format($f$
    SELECT net.http_post(
      url := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/check-maintenance-expiry',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer %s',
        'x-cron-secret','%s'
      ),
      body := '{}'::jsonb
    );
  $f$, anon_key, cron_secret));

  PERFORM cron.unschedule('operations-digest');
  PERFORM cron.schedule('operations-digest', '0 7 * * *', format($f$
    SELECT net.http_post(
      url := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/operations-digest',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer %s',
        'x-cron-secret','%s'
      ),
      body := '{}'::jsonb
    );
  $f$, anon_key, cron_secret));
END $$;