
ALTER TABLE public.airspace_zones DROP CONSTRAINT airspace_zones_zone_type_chk;
ALTER TABLE public.airspace_zones ADD CONSTRAINT airspace_zones_zone_type_chk CHECK (
  zone_type = ANY (ARRAY[
    -- Standard aviation airspace (from AIP)
    'CTR','TIZ','TMZ','RMZ','ATZ','TMA','FIR','P','R','D',
    -- Drone-specific overlays
    'DRONE_NO_FLY','DRONE_DANGER','DRONE_PROTECTED_OBJECT','DRONE_RED','DRONE_ORANGE','DRONE_BLUE',
    -- Buffered / notification zones
    'RPAS_5KM','ATZ_5KM','NSM',
    -- Non-airspace overlays
    'NATURE','NOTAM','OBSTACLE','POWERLINE','OTHER'
  ])
);

ALTER TABLE public.airspace_zones DROP CONSTRAINT airspace_zones_restriction_type_chk;
ALTER TABLE public.airspace_zones ADD CONSTRAINT airspace_zones_restriction_type_chk CHECK (
  restriction_type = ANY (ARRAY[
    'PROHIBITED','RESTRICTED','APPROVAL_REQUIRED','NOTIFICATION','INFO','CAUTION','NATURE_SENSITIVE'
  ])
);

-- Re-trigger
DO $$
DECLARE v_secret text; v_service_key text; v_req_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key FROM vault.decrypted_secrets WHERE name='service_role_key' LIMIT 1;
  SELECT net.http_post(
    url := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/sync-dk-drone-zones',
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer ' || v_service_key, 'x-cron-secret', v_secret),
    body := '{}'::jsonb, timeout_milliseconds := 180000
  ) INTO v_req_id;
END $$;
