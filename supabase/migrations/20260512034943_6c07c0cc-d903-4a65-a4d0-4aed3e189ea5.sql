
DELETE FROM public.dji_sync_jobs
WHERE company_id = (SELECT id FROM public.companies WHERE navn = 'Tensio')
  AND status IN ('queued', 'pending', 'failed')
  AND (payload->>'log_date') IS NOT NULL
  AND (payload->>'log_date')::date < DATE '2025-12-31';
