-- Unschedule existing DJI cron jobs and recreate with expanded window 23:00–05:00 UTC

-- 1. Remove existing jobs if they exist (idempotent)
SELECT cron.unschedule('dji-sync-enqueue-daily');
SELECT cron.unschedule('dji-sync-worker-drain');

-- 2. Enqueue: runs once daily at 23:00 UTC (fills the queue before worker window opens)
SELECT cron.schedule(
  'dji-sync-enqueue-daily',
  '0 23 * * *',
  $$
  SELECT net.http_post(
    url:=CONCAT(current_setting('app.settings.supabase_url'), '/functions/v1/dji-sync-enqueue'),
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', CONCAT('Bearer ', current_setting('app.settings.supabase_anon_key')),
      'x-cron-secret', current_setting('app.settings.cron_shared_secret')
    ),
    body:='{}'::jsonb,
    timeout_milliseconds:=30000
  ) AS request_id;
  $$
);

-- 3. Worker: runs every 2 minutes from 23:00 through 04:59 UTC
SELECT cron.schedule(
  'dji-sync-worker-drain',
  '*/2 23-4 * * *',
  $$
  SELECT net.http_post(
    url:=CONCAT(current_setting('app.settings.supabase_url'), '/functions/v1/dji-sync-worker'),
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', CONCAT('Bearer ', current_setting('app.settings.supabase_anon_key')),
      'x-cron-secret', current_setting('app.settings.cron_shared_secret')
    ),
    body:='{}'::jsonb,
    timeout_milliseconds:=120000
  ) AS request_id;
  $$
);