DO $$
DECLARE r1 bigint; r2 bigint;
BEGIN
  SELECT public.admin_trigger_edge_function('sync-caa-drone-zones', '{"trigger":"manual"}'::jsonb) INTO r1;
  RAISE NOTICE 'sync-caa-drone-zones request id: %', r1;
END $$;