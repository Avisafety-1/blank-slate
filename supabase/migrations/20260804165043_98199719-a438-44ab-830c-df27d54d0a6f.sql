ALTER TABLE public.evaluation_responses
  ADD COLUMN IF NOT EXISTS share_with_admins boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS extra_viewer_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

DROP POLICY IF EXISTS "Users can view evaluation responses in visible companies" ON public.evaluation_responses;

CREATE POLICY "Evaluation responses visibility rules"
ON public.evaluation_responses
FOR SELECT
TO authenticated
USING (
  (company_id = ANY (get_user_visible_company_ids(auth.uid())))
  AND (
    created_by = auth.uid()
    OR instructor_id = auth.uid()
    OR auth.uid() = ANY (extra_viewer_ids)
    OR (student_id = auth.uid() AND status = 'completed')
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'superadmin'::app_role)
  )
);