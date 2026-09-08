CREATE OR REPLACE FUNCTION public.claim_dji_sync_jobs_for_user(_user_id uuid, _limit integer)
 RETURNS SETOF public.dji_sync_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.dji_sync_jobs
    WHERE user_id = _user_id
      AND attempts < 5
      AND (
        (status = 'queued' AND scheduled_at <= now())
        OR (status = 'in_progress' AND locked_until IS NOT NULL AND locked_until < now())
      )
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

REVOKE ALL ON FUNCTION public.claim_dji_sync_jobs_for_user(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_dji_sync_jobs_for_user(uuid, integer) TO service_role;