ALTER TABLE public.monitoring_config
  ADD COLUMN IF NOT EXISTS latency_excluded_function_ids text[] NOT NULL DEFAULT ARRAY[]::text[];

UPDATE public.monitoring_config
SET latency_excluded_function_ids = ARRAY['7ecd3028-0038-4424-be0e-9e7097aeae47']
WHERE id = 1;