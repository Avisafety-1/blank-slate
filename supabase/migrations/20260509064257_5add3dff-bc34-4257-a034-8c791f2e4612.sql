
-- PT-5: require cron secret on weekly-company-report; reschedule with x-cron-secret header
SELECT cron.unschedule('weekly-company-report');

SELECT cron.schedule(
  'weekly-company-report',
  '0 6 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/weekly-company-report',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdWNzdnJ5cG9ndHR0cmFqcXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjcyMDEsImV4cCI6MjA3OTgwMzIwMX0.DMr5OjalAbZKedx0zqcTBWe5eMTrjlXIw384ycvX8dE',
      'x-cron-secret','458cca0e6a197e843c4a1d644f9046e42494285eeb30c01887ed4439e22904cb'
    ),
    body := '{"trigger":"cron"}'::jsonb
  ) AS request_id;
  $$
);
