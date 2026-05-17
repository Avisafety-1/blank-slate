SELECT net.http_post(
  url := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/sync-caa-drone-zones',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdWNzdnJ5cG9ndHR0cmFqcXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjcyMDEsImV4cCI6MjA3OTgwMzIwMX0.DMr5OjalAbZKedx0zqcTBWe5eMTrjlXIw384ycvX8dE',
    'x-cron-secret', '458cca0e6a197e843c4a1d644f9046e42494285eeb30c01887ed4439e22904cb'
  ),
  body := '{"trigger":"manual"}'::jsonb,
  timeout_milliseconds := 120000
);