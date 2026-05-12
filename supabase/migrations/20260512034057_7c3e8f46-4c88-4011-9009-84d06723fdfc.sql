SELECT cron.unschedule('dji-sync-worker-boost') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='dji-sync-worker-boost');

SELECT cron.schedule(
  'dji-sync-worker-boost',
  '* * * * *',
  $$
  DO $body$
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
  END $body$;
  $$
);