
CREATE TABLE public.drone_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drone_id uuid NOT NULL REFERENCES public.drones(id) ON DELETE CASCADE,
  from_company_id uuid NOT NULL REFERENCES public.companies(id),
  to_company_id uuid NOT NULL REFERENCES public.companies(id),
  transferred_at timestamptz NOT NULL DEFAULT now(),
  transferred_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  moved_resources jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_drone_transfers_drone ON public.drone_transfers(drone_id);
CREATE INDEX idx_drone_transfers_from ON public.drone_transfers(from_company_id);
CREATE INDEX idx_drone_transfers_to ON public.drone_transfers(to_company_id);

GRANT SELECT ON public.drone_transfers TO authenticated;
GRANT ALL ON public.drone_transfers TO service_role;

ALTER TABLE public.drone_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view transfers for visible companies"
ON public.drone_transfers
FOR SELECT
TO authenticated
USING (
  from_company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
  OR to_company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
);

CREATE OR REPLACE FUNCTION public.transfer_drone(
  _drone_id uuid,
  _to_company_id uuid,
  _note text,
  _actions jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _from_company_id uuid;
  _caller uuid := auth.uid();
  _is_superadmin boolean;
  _is_from_admin boolean;
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
  _is_from_admin := EXISTS (
    SELECT 1 FROM public.user_companies uc
    WHERE uc.user_id = _caller
      AND uc.company_id = _from_company_id
      AND uc.role IN ('admin','superadmin')
  );

  IF NOT (_is_superadmin OR _is_from_admin) THEN
    RAISE EXCEPTION 'Only admins of the source department can transfer this drone';
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
  DELETE FROM public.drone_department_visibility WHERE drone_id = _drone_id;

  -- Per-resource actions
  FOR _action IN SELECT * FROM jsonb_array_elements(_actions) LOOP
    _type := _action->>'type';
    _resource_id := (_action->>'resource_id')::uuid;
    _act := _action->>'action';

    IF _act = 'move' THEN
      _count_move := _count_move + 1;
      IF _type = 'accessory' THEN
        UPDATE public.drone_accessories SET company_id = _to_company_id WHERE id = _resource_id;
      ELSIF _type = 'dronetag' THEN
        UPDATE public.dronetag_devices SET company_id = _to_company_id WHERE id = _resource_id;
      ELSIF _type = 'equipment' THEN
        UPDATE public.equipment SET company_id = _to_company_id WHERE id = _resource_id;
      ELSIF _type = 'document' THEN
        UPDATE public.documents SET company_id = _to_company_id WHERE id = _resource_id;
      END IF;

    ELSIF _act = 'share' THEN
      _count_share := _count_share + 1;
      IF _type = 'equipment' THEN
        INSERT INTO public.equipment_department_visibility (equipment_id, company_id)
        VALUES (_resource_id, _to_company_id)
        ON CONFLICT DO NOTHING;
      ELSIF _type = 'document' THEN
        UPDATE public.documents SET visible_to_children = true WHERE id = _resource_id;
      END IF;

    ELSIF _act = 'leave' THEN
      _count_leave := _count_leave + 1;
      IF _type = 'equipment' THEN
        DELETE FROM public.drone_equipment WHERE drone_id = _drone_id AND equipment_id = _resource_id;
      ELSIF _type = 'document' THEN
        DELETE FROM public.drone_documents WHERE drone_id = _drone_id AND document_id = _resource_id;
        UPDATE public.drones SET sjekkliste_id = NULL WHERE id = _drone_id AND sjekkliste_id = _resource_id;
        UPDATE public.drones SET post_flight_checklist_id = NULL WHERE id = _drone_id AND post_flight_checklist_id = _resource_id;
        UPDATE public.drones
          SET operations_checklist_ids = array_remove(operations_checklist_ids, _resource_id::text)
          WHERE id = _drone_id
            AND _resource_id::text = ANY (COALESCE(operations_checklist_ids, ARRAY[]::text[]));
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.drone_transfers (drone_id, from_company_id, to_company_id, transferred_by, note, moved_resources)
  VALUES (
    _drone_id, _from_company_id, _to_company_id, _caller, _note,
    jsonb_build_object('move', _count_move, 'share', _count_share, 'leave', _count_leave, 'actions', _actions)
  )
  RETURNING id INTO _transfer_id;

  SELECT navn INTO _from_name FROM public.companies WHERE id = _from_company_id;
  SELECT navn INTO _to_name FROM public.companies WHERE id = _to_company_id;
  SELECT COALESCE(full_name, 'Ukjent') INTO _user_name FROM public.profiles WHERE id = _caller;

  INSERT INTO public.drone_log_entries (drone_id, company_id, user_id, entry_type, title, description, entry_date)
  VALUES (
    _drone_id,
    _to_company_id,
    _caller,
    'Flytting',
    format('Flyttet fra %s til %s', _from_name, _to_name),
    format('Flyttet av %s. %s flyttet med, %s delte synlighet, %s ble igjen.%s',
      COALESCE(_user_name, 'Ukjent'), _count_move, _count_share, _count_leave,
      CASE WHEN _note IS NOT NULL AND length(trim(_note)) > 0 THEN E'\nNotat: ' || _note ELSE '' END
    ),
    now()
  );

  RETURN _transfer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_drone(uuid, uuid, text, jsonb) TO authenticated;
