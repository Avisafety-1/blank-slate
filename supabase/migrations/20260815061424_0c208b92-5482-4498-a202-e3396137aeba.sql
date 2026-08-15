ALTER TABLE public.mission_deviation_reports
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS incident_id uuid REFERENCES public.incidents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS incident_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS incident_requested_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by uuid;

DROP POLICY IF EXISTS "Update deviation reports" ON public.mission_deviation_reports;
CREATE POLICY "Update deviation reports" ON public.mission_deviation_reports
FOR UPDATE TO authenticated
USING (
  company_id = ANY (get_user_visible_company_ids(auth.uid()))
  AND (
    reported_by = auth.uid()
    OR has_role(auth.uid(), 'administrator'::app_role)
    OR has_role(auth.uid(), 'superadmin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.missions m
      WHERE m.id = mission_deviation_reports.mission_id
        AND m.user_id = auth.uid()
    )
  )
)
WITH CHECK (company_id = ANY (get_user_visible_company_ids(auth.uid())));

CREATE TABLE IF NOT EXISTS public.deviation_report_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deviation_id uuid NOT NULL REFERENCES public.mission_deviation_reports(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  author_id uuid,
  comment_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deviation_report_comments TO authenticated;
GRANT ALL ON public.deviation_report_comments TO service_role;

ALTER TABLE public.deviation_report_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View deviation comments" ON public.deviation_report_comments;
CREATE POLICY "View deviation comments" ON public.deviation_report_comments
FOR SELECT TO authenticated
USING (company_id = ANY (get_user_visible_company_ids(auth.uid())));

DROP POLICY IF EXISTS "Insert deviation comments" ON public.deviation_report_comments;
CREATE POLICY "Insert deviation comments" ON public.deviation_report_comments
FOR INSERT TO authenticated
WITH CHECK (company_id = ANY (get_user_visible_company_ids(auth.uid())) AND author_id = auth.uid());

DROP POLICY IF EXISTS "Modify own deviation comments" ON public.deviation_report_comments;
CREATE POLICY "Modify own deviation comments" ON public.deviation_report_comments
FOR UPDATE TO authenticated
USING (author_id = auth.uid())
WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "Delete own deviation comments" ON public.deviation_report_comments;
CREATE POLICY "Delete own deviation comments" ON public.deviation_report_comments
FOR DELETE TO authenticated
USING (author_id = auth.uid() OR has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

CREATE INDEX IF NOT EXISTS idx_deviation_comments_deviation ON public.deviation_report_comments(deviation_id);