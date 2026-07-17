-- Fase B1: Engangs-trigger av sync-se-drone-zones for å importere svenske dronesoner
-- Kjøres én gang manuelt (ikke som cron ennå — venter til DK har kjørt stabilt).
DO $$
DECLARE
  v_supabase_url text;
  v_service_key text;
  v_response record;
BEGIN
  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
    RAISE NOTICE 'Missing vault secrets; skipping trigger. Trigger manually from Edge Functions dashboard.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/sync-se-drone-zones',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key,
      'x-internal-secret', v_service_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  RAISE NOTICE 'sync-se-drone-zones triggered';
END $$;