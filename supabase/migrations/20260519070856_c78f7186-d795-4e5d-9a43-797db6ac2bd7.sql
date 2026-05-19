UPDATE public.monitoring_config
SET latency_excluded_function_ids = array(
  SELECT DISTINCT unnest(latency_excluded_function_ids || ARRAY['4b281c52-4bbe-4481-b102-eb24d46300af'])
)
WHERE id = 1;