DO $$
DECLARE
  v_supabase_url text;
  v_cron_secret text;
  v_service_key text;
  v_req_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  SELECT decrypted_secret INTO v_cron_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SHARED_SECRET' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

  CREATE TEMP TABLE IF NOT EXISTS _dbg(msg text);
  INSERT INTO _dbg VALUES (
    format('url=%s cron=%s service=%s',
      (v_supabase_url IS NOT NULL),
      (v_cron_secret IS NOT NULL),
      (v_service_key IS NOT NULL))
  );

  IF v_supabase_url IS NULL THEN RETURN; END IF;

  -- Prøv med cron-secret hvis vi har det, ellers service_key som Bearer
  IF v_cron_secret IS NOT NULL THEN
    SELECT net.http_post(
      url := v_supabase_url || '/functions/v1/sync-se-drone-zones',
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', v_cron_secret),
      body := '{}'::jsonb,
      timeout_milliseconds := 180000
    ) INTO v_req_id;
    INSERT INTO _dbg VALUES ('cron-triggered req_id=' || v_req_id);
  ELSIF v_service_key IS NOT NULL THEN
    SELECT net.http_post(
      url := v_supabase_url || '/functions/v1/sync-se-drone-zones',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_service_key),
      body := '{}'::jsonb,
      timeout_milliseconds := 180000
    ) INTO v_req_id;
    INSERT INTO _dbg VALUES ('service-triggered req_id=' || v_req_id);
  END IF;

  -- Skriv til en permanent tabell så vi kan lese resultatet etterpå
  CREATE TABLE IF NOT EXISTS public._airspace_sync_debug (created timestamptz DEFAULT now(), msg text);
  INSERT INTO public._airspace_sync_debug (msg) SELECT msg FROM _dbg;
END $$;