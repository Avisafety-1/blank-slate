
-- 0. Safe UUID parse helper (returns NULL instead of raising on invalid input)
CREATE OR REPLACE FUNCTION public.try_parse_uuid(_text text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN _text::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.try_parse_uuid(text) TO authenticated, service_role;

-- 1. Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('flight-logs', 'flight-logs', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage policies (safe-cast, private bucket, company-scoped)
DROP POLICY IF EXISTS "Users upload flight-logs to own company path" ON storage.objects;
DROP POLICY IF EXISTS "Admins read flight-logs in own companies" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete flight-logs in own companies" ON storage.objects;

CREATE POLICY "Users upload flight-logs to own company path"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'flight-logs'
  AND public.try_parse_uuid((storage.foldername(name))[1]) IS NOT NULL
  AND public.try_parse_uuid((storage.foldername(name))[1])
      = ANY (public.get_user_visible_company_ids(auth.uid()))
);

CREATE POLICY "Admins read flight-logs in own companies"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'flight-logs'
  AND public.try_parse_uuid((storage.foldername(name))[1]) IS NOT NULL
  AND public.try_parse_uuid((storage.foldername(name))[1])
      = ANY (public.get_user_visible_company_ids(auth.uid()))
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'superadmin'::app_role))
);

CREATE POLICY "Admins delete flight-logs in own companies"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'flight-logs'
  AND public.try_parse_uuid((storage.foldername(name))[1]) IS NOT NULL
  AND public.try_parse_uuid((storage.foldername(name))[1])
      = ANY (public.get_user_visible_company_ids(auth.uid()))
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'superadmin'::app_role))
);

-- 3. Queue table
CREATE TABLE IF NOT EXISTS public.ardupilot_parse_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'flight-logs',
  storage_path TEXT NOT NULL,
  original_filename TEXT,
  file_size_bytes BIGINT,
  content_type TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','in_progress','done','failed','unsupported')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  step_durations JSONB,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ,
  pending_log_id UUID REFERENCES public.pending_dji_logs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ardupilot_parse_jobs_status_scheduled
  ON public.ardupilot_parse_jobs (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_ardupilot_parse_jobs_status_locked
  ON public.ardupilot_parse_jobs (status, locked_until);
CREATE INDEX IF NOT EXISTS idx_ardupilot_parse_jobs_company
  ON public.ardupilot_parse_jobs (company_id);
CREATE INDEX IF NOT EXISTS idx_ardupilot_parse_jobs_user
  ON public.ardupilot_parse_jobs (user_id);

DROP TRIGGER IF EXISTS ardupilot_parse_jobs_set_updated_at ON public.ardupilot_parse_jobs;
CREATE TRIGGER ardupilot_parse_jobs_set_updated_at
  BEFORE UPDATE ON public.ardupilot_parse_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT ON public.ardupilot_parse_jobs TO authenticated;
GRANT ALL ON public.ardupilot_parse_jobs TO service_role;

ALTER TABLE public.ardupilot_parse_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ardupilot parse jobs"
  ON public.ardupilot_parse_jobs FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
      AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'superadmin'::app_role))
    )
  );

CREATE POLICY "Users insert ardupilot parse jobs for self"
  ON public.ardupilot_parse_jobs FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
  );

-- 4. Claim worker function (capped at 10)
CREATE OR REPLACE FUNCTION public.claim_ardupilot_parse_jobs(_limit INT)
RETURNS SETOF public.ardupilot_parse_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.ardupilot_parse_jobs
    WHERE attempts < 3
      AND (
        (status = 'queued' AND scheduled_at <= now())
        OR (status = 'in_progress' AND locked_until IS NOT NULL AND locked_until < now())
      )
    ORDER BY scheduled_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(_limit, 1), 10)
  )
  UPDATE public.ardupilot_parse_jobs j
  SET status = 'in_progress',
      attempts = j.attempts + 1,
      locked_until = now() + interval '5 minutes',
      updated_at = now()
  FROM picked
  WHERE j.id = picked.id
  RETURNING j.*;
END;
$$;

-- 5. Retry RPC (admin-only)
CREATE OR REPLACE FUNCTION public.retry_ardupilot_parse_job(_job_id UUID)
RETURNS public.ardupilot_parse_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.ardupilot_parse_jobs;
  v_uid UUID := auth.uid();
BEGIN
  SELECT * INTO v_job FROM public.ardupilot_parse_jobs WHERE id = _job_id;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  IF NOT (
    v_job.company_id = ANY (public.get_user_visible_company_ids(v_uid))
    AND (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'superadmin'::app_role))
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.ardupilot_parse_jobs
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

REVOKE ALL ON FUNCTION public.claim_ardupilot_parse_jobs(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retry_ardupilot_parse_job(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_ardupilot_parse_jobs(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_ardupilot_parse_job(UUID) TO authenticated;
