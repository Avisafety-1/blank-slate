DO $$
DECLARE
  v_secret text; v_service_key text; v_req_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key FROM vault.decrypted_secrets WHERE name='service_role_key' LIMIT 1;
  SELECT net.http_post(
    url := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/sync-se-drone-zones',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || v_service_key,
      'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  ) INTO v_req_id;
  RAISE NOTICE 'SE-sync triggered, request_id=%', v_req_id;
END $$;