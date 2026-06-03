CREATE OR REPLACE FUNCTION public.transfer_drone(_drone_id uuid, _to_company_id uuid, _note text, _actions jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _from_company_id uuid;
  _caller uuid := auth.uid();
  _is_superadmin boolean;
  _is_admin boolean;
  _from_root uuid;
  _to_root uuid;
  _action jsonb;
  _type text;
  _resource_id uuid;
  _act text;
  _exists boolean;
  _count_move int := 0;
  _count_share int := 0;
  _count_leave int := 0;
  _transfer_id uuid;
  _from_name text;
  _to_name text;
  _user_name text;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _actions IS NULL THEN
    _actions := '[]'::jsonb;
  ELSIF jsonb_typeof(_actions) <> 'array' THEN
    RAISE EXCEPTION '_actions must be a JSON array';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _to_company_id) THEN
    RAISE EXCEPTION 'Target company not found';
  END IF;

  SELECT company_id
    INTO _from_company_id
  FROM public.drones
  WHERE id = _drone_id
  FOR UPDATE;

  IF _from_company_id IS NULL THEN
    RAISE EXCEPTION 'Drone not found';
  END IF;
  IF _from_company_id = _to_company_id THEN
    RAISE EXCEPTION 'Drone is already in target department';
  END IF;

  _is_superadmin := public.has_role(_caller, 'superadmin'::app_role);

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _caller
      AND role::text IN ('admin','administrator','superadmin')
  ) INTO _is_admin;

  IF NOT _is_superadmin THEN
    IF NOT _is_admin
       OR _from_company_id NOT IN (
            SELECT company_id FROM public.get_user_visible_company_ids(_caller)
          )
    THEN
      RAISE EXCEPTION 'Only admins of the source department can transfer this drone';
    END IF;
  END IF;

  _from_root := COALESCE(public.get_parent_company_id(_from_company_id), _from_company_id);
  _to_root := COALESCE(public.get_parent_company_id(_to_company_id), _to_company_id);
  IF _from_root <> _to_root AND NOT _is_superadmin THEN
    RAISE EXCEPTION 'Target department is not in the same hierarchy';
  END IF;

  -- Validate ownership of every resource BEFORE mutating
  FOR _action IN SELECT * FROM jsonb_array_elements(_actions) LOOP
    _type := _action->>'type';
    _resource_id := (_action->>'resource_id')::uuid;
    _act := _action->>'action';

    IF _type IS NULL OR _resource_id IS NULL OR _act IS NULL THEN
      RAISE EXCEPTION 'Invalid action entry: %', _action;
    END IF;
    IF _act NOT IN ('move','share','leave') THEN
      RAISE EXCEPTION 'Invalid action % for resource %', _act, _resource_id;
    END IF;
    IF _act = 'share' AND _type NOT IN ('equipment','document') THEN
      RAISE EXCEPTION 'Share not supported for type % (resource %)', _type, _resource_id;
    END IF;

    IF _type = 'accessory' THEN
      SELECT EXISTS(SELECT 1 FROM public.drone_accessories WHERE id = _resource_id AND drone_id = _drone_id) INTO _exists;
    ELSIF _type = 'dronetag' THEN
      SELECT EXISTS(SELECT 1 FROM public.dronetag_devices WHERE id = _resource_id AND drone_id = _drone_id) INTO _exists;
    ELSIF _type = 'equipment' THEN
      SELECT EXISTS(SELECT 1 FROM public.drone_equipment WHERE drone_id = _drone_id AND equipment_id = _resource_id) INTO _exists;
    ELSIF _type = 'document' THEN
      SELECT EXISTS(
        SELECT 1 FROM public.drone_documents WHERE drone_id = _drone_id AND document_id = _resource_id
        UNION ALL
        SELECT 1 FROM public.drones d
          WHERE d.id = _drone_id
            AND (
              d.sjekkliste_id = _resource_id
              OR d.post_flight_checklist_id = _resource_id
              OR _resource_id::text = ANY (COALESCE(d.operations_checklist_ids, ARRAY[]::text[]))
            )
      ) INTO _exists;
    ELSE
      RAISE EXCEPTION 'Unknown resource type: %', _type;
    END IF;

    IF NOT _exists THEN
      RAISE EXCEPTION 'Resource % of type % does not belong to drone %', _resource_id, _type, _drone_id;
    END IF;
  END LOOP;

  -- Always-moved data
  UPDATE public.drones SET company_id = _to_company_id, oppdatert_dato = now() WHERE id = _drone_id;
  UPDATE public.drone_log_entries SET company_id = _to_company_id WHERE drone_id = _drone_id;
  UPDATE public.drone_inspections SET company_id = _to_company_id WHERE drone_id = _drone_id;
  UPDATE public.drone_equipment_history SET company_id = _to_company_id WHERE drone_id = _drone_id;

  -- Clear existing department visibility shares for this drone
  DELETE FROM public.drone_department_visibility WHERE drone_id = _drone_id;

  -- Per-resource actions
  FOR _action IN SELECT * FROM jsonb_array_elements(_actions) LOOP
    _type := _action->>'type';
    _resource_id := (_action->>'resource_id')::uuid;
    _act := _action->>'action';

    IF _act = 'move' THEN
      IF _type = 'accessory' THEN
        UPDATE public.drone_accessories SET company_id = _to_company_id WHERE id = _resource_id;
      ELSIF _type = 'dronetag' THEN
        UPDATE public.dronetag_devices SET company_id = _to_company_id WHERE id = _resource_id;
      ELSIF _type = 'equipment' THEN
        UPDATE public.equipment SET company_id = _to_company_id WHERE id = _resource_id;
      ELSIF _type = 'document' THEN
        UPDATE public.documents SET company_id = _to_company_id WHERE id = _resource_id;
      END IF;
      _count_move := _count_move + 1;

    ELSIF _act = 'share' THEN
      IF _type = 'equipment' THEN
        INSERT INTO public.equipment_department_visibility (equipment_id, company_id)
        VALUES (_resource_id, _to_company_id)
        ON CONFLICT DO NOTHING;
      ELSIF _type = 'document' THEN
        UPDATE public.documents SET visible_to_children = true WHERE id = _resource_id;
      END IF;
      _count_share := _count_share + 1;

    ELSIF _act = 'leave' THEN
      IF _type = 'accessory' THEN
        UPDATE public.drone_accessories SET drone_id = NULL WHERE id = _resource_id;
      ELSIF _type = 'dronetag' THEN
        UPDATE public.dronetag_devices SET drone_id = NULL WHERE id = _resource_id;
      ELSIF _type = 'equipment' THEN
        DELETE FROM public.drone_equipment WHERE drone_id = _drone_id AND equipment_id = _resource_id;
      ELSIF _type = 'document' THEN
        DELETE FROM public.drone_documents WHERE drone_id = _drone_id AND document_id = _resource_id;
      END IF;
      _count_leave := _count_leave + 1;
    END IF;
  END LOOP;

  INSERT INTO public.drone_transfers (drone_id, from_company_id, to_company_id, transferred_by, note, moved_resources)
  VALUES (_drone_id, _from_company_id, _to_company_id, _caller, _note,
          jsonb_build_object('move', _count_move, 'share', _count_share, 'leave', _count_leave, 'actions', _actions))
  RETURNING id INTO _transfer_id;

  SELECT navn INTO _from_name FROM public.companies WHERE id = _from_company_id;
  SELECT navn INTO _to_name FROM public.companies WHERE id = _to_company_id;
  SELECT COALESCE(full_name, 'Ukjent') INTO _user_name FROM public.profiles WHERE id = _caller;

  INSERT INTO public.drone_log_entries (drone_id, company_id, entry_type, description, performed_by, performed_at)
  VALUES (
    _drone_id,
    _to_company_id,
    'Flytting',
    format('Flyttet fra %s til %s av %s. %s ressurser flyttet, %s delt, %s frakoblet.%s',
           COALESCE(_from_name,'?'), COALESCE(_to_name,'?'), _user_name,
           _count_move, _count_share, _count_leave,
           CASE WHEN _note IS NOT NULL AND length(_note) > 0 THEN ' Notat: ' || _note ELSE '' END),
    _user_name,
    now()
  );

  RETURN _transfer_id;
END;
$function$;