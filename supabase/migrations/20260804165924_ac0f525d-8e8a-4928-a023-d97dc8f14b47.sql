CREATE OR REPLACE FUNCTION public.get_mission_evaluation_state(p_mission_id uuid, p_template_id uuid)
RETURNS TABLE(response_exists boolean, response_status text, can_view boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    true,
    r.status,
    (
      r.company_id = ANY (get_user_visible_company_ids(auth.uid()))
      AND (
        r.created_by = auth.uid()
        OR r.instructor_id = auth.uid()
        OR auth.uid() = ANY (r.extra_viewer_ids)
        OR (r.student_id = auth.uid() AND r.status = 'completed')
        OR has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'superadmin'::app_role)
      )
    )
  FROM public.evaluation_responses r
  WHERE r.mission_id = p_mission_id
    AND r.template_id = p_template_id
    AND r.company_id = ANY (get_user_visible_company_ids(auth.uid()))
  ORDER BY r.created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_mission_evaluation_state(uuid, uuid) TO authenticated;