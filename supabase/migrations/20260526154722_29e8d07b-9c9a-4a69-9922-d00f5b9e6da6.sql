select cron.schedule(
  'check-currency-status-daily',
  '30 5 * * *',
  $$
  select net.http_post(
    url:='https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/check-currency-status',
    headers:='{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdWNzdnJ5cG9ndHR0cmFqcXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjcyMDEsImV4cCI6MjA3OTgwMzIwMX0.DMr5OjalAbZKedx0zqcTBWe5eMTrjlXIw384ycvX8dE"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);