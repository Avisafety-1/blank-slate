SELECT cron.unschedule('dji-sync-enqueue-daily');
SELECT cron.unschedule('dji-sync-worker-drain');

SELECT cron.schedule(
  'dji-sync-enqueue-daily',
  '0 21 * * *',
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

SELECT cron.schedule(
  'dji-sync-worker-drain',
  '*/2 21-3 * * *',
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