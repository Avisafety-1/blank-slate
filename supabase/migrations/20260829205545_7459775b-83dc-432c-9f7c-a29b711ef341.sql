CREATE OR REPLACE FUNCTION public.set_resource_status(
  _resource_type text,
  _resource_id uuid,
  _status text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _company uuid;
  _old_status text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF _status NOT IN ('Grønn', 'Gul', 'Rød') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  IF _resource_type = 'drone' THEN
    SELECT company_id, status INTO _company, _old_status FROM public.drones WHERE id = _resource_id;
  ELSIF _resource_type = 'equipment' THEN
    SELECT company_id, status INTO _company, _old_status FROM public.equipment WHERE id = _resource_id;
  ELSE
    RAISE EXCEPTION 'invalid_resource_type';
  END IF;

  IF _company IS NULL THEN
    RAISE EXCEPTION 'resource_not_found';
  END IF;

  IF NOT (_company = ANY(public.get_user_visible_company_ids(_uid))) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF _resource_type = 'drone' THEN
    UPDATE public.drones SET status = _status WHERE id = _resource_id;
  ELSE
    UPDATE public.equipment SET status = _status WHERE id = _resource_id;
  END IF;

  RETURN COALESCE(_old_status, 'Grønn');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_resource_status(text, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_resource_status(text, uuid, text) TO authenticated;