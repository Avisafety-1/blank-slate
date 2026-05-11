DO $$
DECLARE j text;
BEGIN
  FOREACH j IN ARRAY ARRAY['dji-auto-sync-daily','dji-sync-enqueue-daily','dji-sync-worker-drain']
  LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
    END IF;
  END LOOP;
END $$;

SELECT cron.schedule(
  'dji-sync-enqueue-daily',
  '0 2 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/dji-sync-enqueue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_anon_key' LIMIT 1),
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret' LIMIT 1)
    ),
    body := jsonb_build_object('time', now())
  ) AS request_id;
  $cron$
);

SELECT cron.schedule(
  'dji-sync-worker-drain',
  '*/2 2-3 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/dji-sync-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret' LIMIT 1)
    ),
    body := jsonb_build_object('time', now())
  ) AS request_id;
  $cron$
);