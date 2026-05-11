
CREATE TABLE IF NOT EXISTS public.dji_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  dji_log_id TEXT NOT NULL,
  download_url TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','in_progress','done','failed','unsupported')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  step_durations JSONB,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dji_sync_jobs_unique_log UNIQUE (company_id, user_id, dji_log_id)
);

CREATE INDEX IF NOT EXISTS idx_dji_sync_jobs_status_scheduled
  ON public.dji_sync_jobs (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_dji_sync_jobs_status_locked
  ON public.dji_sync_jobs (status, locked_until);
CREATE INDEX IF NOT EXISTS idx_dji_sync_jobs_company
  ON public.dji_sync_jobs (company_id);
CREATE INDEX IF NOT EXISTS idx_dji_sync_jobs_user
  ON public.dji_sync_jobs (user_id);

DROP TRIGGER IF EXISTS dji_sync_jobs_set_updated_at ON public.dji_sync_jobs;
CREATE TRIGGER dji_sync_jobs_set_updated_at
  BEFORE UPDATE ON public.dji_sync_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.dji_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view dji_sync_jobs in their companies"
  ON public.dji_sync_jobs
  FOR SELECT
  TO authenticated
  USING (
    company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'superadmin'::app_role)
    )
  );

CREATE OR REPLACE FUNCTION public.claim_dji_sync_jobs(_limit INT)
RETURNS SETOF public.dji_sync_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.dji_sync_jobs
    WHERE attempts < 5
      AND (
        (status = 'queued' AND scheduled_at <= now())
        OR (status = 'in_progress' AND locked_until IS NOT NULL AND locked_until < now())
      )
    ORDER BY scheduled_at ASC
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
$$;

CREATE OR REPLACE FUNCTION public.retry_dji_sync_job(_job_id UUID)
RETURNS public.dji_sync_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.dji_sync_jobs;
  v_uid UUID := auth.uid();
BEGIN
  SELECT * INTO v_job FROM public.dji_sync_jobs WHERE id = _job_id;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  IF NOT (
    v_job.company_id = ANY (public.get_user_visible_company_ids(v_uid))
    AND (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'superadmin'::app_role))
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.dji_sync_jobs
  SET status = 'queued',
      attempts = 0,
      last_error = NULL,
      last_error_at = NULL,
      locked_until = NULL,
      scheduled_at = now(),
      updated_at = now()
  WHERE id = _job_id
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_dji_sync_jobs(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retry_dji_sync_job(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_dji_sync_jobs(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_dji_sync_job(UUID) TO authenticated;
