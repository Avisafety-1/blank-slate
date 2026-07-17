DO $$
DECLARE
  v_supabase_url text;
  v_cron_secret text;
BEGIN
  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  SELECT decrypted_secret INTO v_cron_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SHARED_SECRET' LIMIT 1;

  IF v_supabase_url IS NULL OR v_cron_secret IS NULL THEN
    RAISE NOTICE 'Missing vault secrets: url=% cron=%', (v_supabase_url IS NOT NULL), (v_cron_secret IS NOT NULL);
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/sync-se-drone-zones',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 180000
  );
END $$;