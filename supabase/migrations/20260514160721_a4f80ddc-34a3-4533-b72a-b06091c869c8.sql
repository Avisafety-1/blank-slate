UPDATE public.monitoring_config
SET latency_excluded_function_ids = ARRAY[
  '7ecd3028-0038-4424-be0e-9e7097aeae47'::text,
  'fd635dd6-4229-4ece-af45-15740697f343'::text
]
WHERE id = 1;