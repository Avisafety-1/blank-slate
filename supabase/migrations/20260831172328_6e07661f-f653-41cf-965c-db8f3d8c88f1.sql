CREATE OR REPLACE FUNCTION public.set_deviation_status(_deviation_id uuid, _status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _status NOT IN ('new', 'in_progress', 'closed') THEN
    RAISE EXCEPTION 'Invalid status: %', _status;
  END IF;

  SELECT company_id INTO v_company
  FROM public.mission_deviation_reports
  WHERE id = _deviation_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Deviation not found';
  END IF;

  IF NOT (v_company = ANY (public.get_user_visible_company_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'No access to this deviation';
  END IF;

  SELECT COALESCE(p.can_be_incident_responsible, false) INTO v_allowed
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'Only follow-up responsible users can change deviation status';
  END IF;

  UPDATE public.mission_deviation_reports
  SET status = _status,
      updated_at = now(),
      updated_by = auth.uid()
  WHERE id = _deviation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_deviation_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_deviation_status(uuid, text) TO authenticated;