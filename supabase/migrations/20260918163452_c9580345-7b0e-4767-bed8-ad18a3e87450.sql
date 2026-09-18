CREATE OR REPLACE FUNCTION public.get_propagating_parent_company_id(_company_id uuid, _flag text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent uuid;
  _on boolean;
BEGIN
  SELECT c.parent_company_id INTO _parent FROM public.companies c WHERE c.id = _company_id;
  IF _parent IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT CASE _flag
    WHEN 'mission_roles' THEN p.propagate_mission_roles
    WHEN 'mission_types' THEN p.propagate_mission_types
    WHEN 'flight_alerts' THEN p.propagate_flight_alerts
    WHEN 'sora_config' THEN p.propagate_sora_config
    WHEN 'sora_buffer_mode' THEN p.propagate_sora_buffer_mode
    WHEN 'default_map_layers' THEN p.propagate_default_map_layers
    ELSE false
  END INTO _on
  FROM public.companies p WHERE p.id = _parent;

  IF COALESCE(_on, false) THEN
    RETURN _parent;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_propagating_parent_company_id(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_propagating_parent_company_id(uuid, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can view roles for visible companies" ON public.company_mission_roles;
CREATE POLICY "Users can view roles for visible companies"
ON public.company_mission_roles
FOR SELECT
TO authenticated
USING (
  company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
  OR company_id = public.get_propagating_parent_company_id(public.get_user_company_id(auth.uid()), 'mission_roles')
);

DROP POLICY IF EXISTS "Users can view flight alerts for visible companies" ON public.company_flight_alerts;
CREATE POLICY "Users can view flight alerts for visible companies"
ON public.company_flight_alerts
FOR SELECT
TO authenticated
USING (
  company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
  OR company_id = public.get_propagating_parent_company_id(public.get_user_company_id(auth.uid()), 'flight_alerts')
);