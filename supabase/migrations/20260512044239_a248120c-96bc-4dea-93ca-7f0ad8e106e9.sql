-- Enqueue oftere så alle selskaper får sine nyeste logger oppdaget raskt
SELECT cron.schedule(
  'dji-sync-enqueue-boost',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/dji-sync-enqueue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_anon_key' LIMIT 1),
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id;
  $$
);

-- 5 parallelle workers hvert minutt for å tømme køen raskt
SELECT cron.schedule(
  'dji-sync-worker-boost',
  '* * * * *',
  $body$
  DO $inner$
  DECLARE
    v_secret text;
    v_anon text;
    i int;
  BEGIN
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret';
    SELECT decrypted_secret INTO v_anon FROM vault.decrypted_secrets WHERE name='supabase_anon_key';
    FOR i IN 1..5 LOOP
      PERFORM net.http_post(
        url := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/dji-sync-worker',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-cron-secret', v_secret,
          'Authorization', 'Bearer ' || v_anon
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    END LOOP;
  END $inner$;
  $body$
);