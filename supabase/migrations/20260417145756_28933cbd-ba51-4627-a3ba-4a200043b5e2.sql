UPDATE public.app_config SET value = '23', updated_at = now() WHERE key = 'app_version';
SELECT pg_notify('supabase_realtime', json_build_object(
  'topic', 'global-force-reload',
  'event', 'reload',
  'payload', json_build_object('version', '23', 'forceImmediate', true)
)::text);