CREATE OR REPLACE FUNCTION public.acknowledge_resource_warning(
  _resource_type text,
  _resource_id uuid,
  _note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _company uuid;
  _tech uuid;
  _old_status text;
  _visible uuid[];
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  _visible := public.get_user_visible_company_ids(_uid);

  IF _resource_type = 'drone' THEN
    SELECT company_id, technical_responsible_id, status
      INTO _company, _tech, _old_status
      FROM public.drones WHERE id = _resource_id;
  ELSIF _resource_type = 'equipment' THEN
    SELECT company_id, technical_responsible_id, status
      INTO _company, _tech, _old_status
      FROM public.equipment WHERE id = _resource_id;
  ELSE
    RAISE EXCEPTION 'invalid_resource_type';
  END IF;

  IF _company IS NULL THEN
    RAISE EXCEPTION 'resource_not_found';
  END IF;

  IF NOT (_company = ANY(_visible)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT (
    public.has_role(_uid, 'admin'::app_role)
    OR public.is_superadmin(_uid)
    OR _tech = _uid
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF _resource_type = 'drone' THEN
    UPDATE public.drones SET status = 'Grønn' WHERE id = _resource_id;
    INSERT INTO public.drone_log_entries (drone_id, company_id, user_id, entry_date, entry_type, title, description)
    VALUES (_resource_id, _company, _uid, CURRENT_DATE, 'Kvittering', 'Advarsel kvittert ut',
            COALESCE(_note, 'Status endret fra ' || COALESCE(_old_status, '-') || ' til Grønn'));
  ELSE
    UPDATE public.equipment SET status = 'Grønn' WHERE id = _resource_id;
    INSERT INTO public.equipment_log_entries (equipment_id, company_id, user_id, entry_date, entry_type, title, description)
    VALUES (_resource_id, _company, _uid, CURRENT_DATE, 'Kvittering', 'Advarsel kvittert ut',
            COALESCE(_note, 'Status endret fra ' || COALESCE(_old_status, '-') || ' til Grønn'));
  END IF;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.acknowledge_resource_warning(text, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.acknowledge_resource_warning(text, uuid, text) TO authenticated;