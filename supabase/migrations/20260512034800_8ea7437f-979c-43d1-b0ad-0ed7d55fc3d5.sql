
-- Set sync from-date for Tensio Nord and Tensio Sør to match parent
UPDATE public.companies
SET dji_sync_from_date = '2025-12-31'
WHERE navn IN ('Tensio Nord', 'Tensio Sør')
  AND dji_sync_from_date IS NULL;

-- Cancel queued/pending jobs for old logs (before 2025-12-31) for those companies
DELETE FROM public.dji_sync_jobs
WHERE company_id IN (
    SELECT id FROM public.companies WHERE navn IN ('Tensio Nord', 'Tensio Sør')
  )
  AND status IN ('queued', 'pending', 'failed')
  AND (
    (payload->>'log_date') IS NOT NULL
    AND (payload->>'log_date')::date < DATE '2025-12-31'
  );
