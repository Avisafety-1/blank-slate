CREATE OR REPLACE FUNCTION public.get_propagating_parent_company_id(_company_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM public.companies c
  JOIN public.companies p ON p.id = c.parent_company_id
  WHERE c.id = _company_id
    AND COALESCE(p.propagate_mission_types, false) = true
$$;

REVOKE EXECUTE ON FUNCTION public.get_propagating_parent_company_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_propagating_parent_company_id(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS mission_types_select ON public.company_mission_types;
CREATE POLICY mission_types_select
ON public.company_mission_types
FOR SELECT
TO authenticated
USING (
  company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
  OR company_id = public.get_propagating_parent_company_id(
       (SELECT company_id FROM public.profiles WHERE id = auth.uid())
     )
);