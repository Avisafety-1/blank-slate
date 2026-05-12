CREATE OR REPLACE FUNCTION public.claim_dji_sync_jobs(_limit integer)
 RETURNS SETOF dji_sync_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH eligible AS (
    SELECT id, company_id, created_at,
           ROW_NUMBER() OVER (
             PARTITION BY company_id
             ORDER BY created_at DESC
           ) AS rn_company
    FROM public.dji_sync_jobs
    WHERE attempts < 5
      AND (
        (status = 'queued' AND scheduled_at <= now())
        OR (status = 'in_progress' AND locked_until IS NOT NULL AND locked_until < now())
      )
  ),
  picked AS (
    SELECT id
    FROM eligible
    WHERE rn_company = 1
    ORDER BY created_at DESC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(_limit, 1)
  )
  UPDATE public.dji_sync_jobs j
  SET status = 'in_progress',
      attempts = j.attempts + 1,
      locked_until = now() + interval '5 minutes',
      updated_at = now()
  FROM picked
  WHERE j.id = picked.id
  RETURNING j.*;
END;
$function$;