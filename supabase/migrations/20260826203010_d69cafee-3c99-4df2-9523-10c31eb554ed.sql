CREATE OR REPLACE FUNCTION public.reassign_flight_log(
  p_flight_log_id uuid,
  p_drone_id uuid DEFAULT NULL,
  p_pilot_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_log record;
  v_hours numeric;
  v_old_pilot uuid;
  v_drone_changed boolean := false;
  v_pilot_changed boolean := false;
  v_moved_warnings int := 0;
  v_moved_personnel int := 0;
  v_old_drone_company uuid;
  v_new_drone_company uuid;
  v_new_pilot_company uuid;
  v_old_drone_name text;
  v_new_drone_name text;
  v_is_priv boolean;
  v_visible uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, drone_id, user_id, company_id, flight_date, flight_duration_minutes, created_at
    INTO v_log
  FROM flight_logs WHERE id = p_flight_log_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Flight log not found';
  END IF;

  v_is_priv := public.has_role(v_uid, 'superadmin')
            OR public.has_role(v_uid, 'admin')
            OR public.has_role(v_uid, 'operativ_leder');

  IF NOT (v_is_priv OR v_log.user_id = v_uid) THEN
    RAISE EXCEPTION 'Not allowed to modify this flight log';
  END IF;

  -- Companies visible to the caller via the standard hierarchy rule
  -- (own company via profiles, plus children for admins). This matches how
  -- the rest of the app scopes access; can_user_access_company is kept as an
  -- additional allowance for users linked via user_companies.
  v_visible := public.get_user_visible_company_ids(v_uid);

  IF NOT public.has_role(v_uid, 'superadmin')
     AND v_log.company_id IS NOT NULL
     AND NOT (v_log.company_id = ANY(COALESCE(v_visible, '{}'))
              OR public.can_user_access_company(v_uid, v_log.company_id)) THEN
    RAISE EXCEPTION 'Flight log not accessible';
  END IF;

  v_hours := COALESCE(v_log.flight_duration_minutes, 0) / 60.0;

  SELECT profile_id INTO v_old_pilot
  FROM flight_log_personnel WHERE flight_log_id = p_flight_log_id
  ORDER BY id LIMIT 1;
  IF v_old_pilot IS NULL THEN
    v_old_pilot := v_log.user_id;
  END IF;

  v_drone_changed := p_drone_id IS NOT NULL AND p_drone_id IS DISTINCT FROM v_log.drone_id;
  v_pilot_changed := p_pilot_id IS NOT NULL AND p_pilot_id IS DISTINCT FROM v_old_pilot;

  IF NOT v_drone_changed AND NOT v_pilot_changed THEN
    RETURN jsonb_build_object('changed', false);
  END IF;

  -- ---------- Drone ----------
  IF v_drone_changed THEN
    SELECT company_id, COALESCE(modell, '') INTO v_new_drone_company, v_new_drone_name
    FROM drones WHERE id = p_drone_id;
    IF v_new_drone_company IS NULL THEN
      RAISE EXCEPTION 'Target drone not found';
    END IF;
    IF NOT public.has_role(v_uid, 'superadmin')
       AND NOT (v_new_drone_company = ANY(COALESCE(v_visible, '{}'))
                OR public.can_user_access_company(v_uid, v_new_drone_company)) THEN
      RAISE EXCEPTION 'Target drone not accessible';
    END IF;

    IF v_log.drone_id IS NOT NULL THEN
      SELECT company_id, COALESCE(modell, '') INTO v_old_drone_company, v_old_drone_name
      FROM drones WHERE id = v_log.drone_id;
    END IF;

    UPDATE flight_logs SET drone_id = p_drone_id WHERE id = p_flight_log_id;

    -- Move only warning entries that clearly belong to this flight:
    -- same drone, same date, same author, created within 10 minutes of the flight log row
    IF v_log.drone_id IS NOT NULL AND v_log.user_id IS NOT NULL THEN
      WITH moved AS (
        UPDATE drone_log_entries
        SET drone_id = p_drone_id, company_id = v_new_drone_company
        WHERE drone_id = v_log.drone_id
          AND entry_type = 'Advarsel'
          AND entry_date = v_log.flight_date
          AND user_id = v_log.user_id
          AND v_log.created_at IS NOT NULL
          AND created_at BETWEEN v_log.created_at - interval '10 minutes'
                             AND v_log.created_at + interval '10 minutes'
        RETURNING 1
      )
      SELECT count(*) INTO v_moved_warnings FROM moved;
    END IF;

    -- Move accumulated flight hours
    IF v_hours > 0 THEN
      IF v_log.drone_id IS NOT NULL THEN
        UPDATE drones
        SET flyvetimer = GREATEST(0, COALESCE(flyvetimer, 0) - v_hours)
        WHERE id = v_log.drone_id;
      END IF;
      UPDATE drones
      SET flyvetimer = COALESCE(flyvetimer, 0) + v_hours
      WHERE id = p_drone_id;
    END IF;

    -- Traceability entries in both drone logbooks
    IF v_log.drone_id IS NOT NULL AND v_old_drone_company IS NOT NULL THEN
      INSERT INTO drone_log_entries (drone_id, company_id, user_id, entry_date, entry_type, title, description)
      VALUES (v_log.drone_id, v_old_drone_company, v_uid, now(), 'Flytting',
        'Flylogg flyttet herfra',
        'Flylogg ' || left(p_flight_log_id::text, 8) || ' (' || to_char(v_log.flight_date, 'YYYY-MM-DD') ||
        ') ble flyttet til ' || COALESCE(NULLIF(v_new_drone_name, ''), p_drone_id::text) ||
        '. ' || round(v_hours, 2)::text || ' flytimer trukket fra.');
    END IF;
    INSERT INTO drone_log_entries (drone_id, company_id, user_id, entry_date, entry_type, title, description)
    VALUES (p_drone_id, v_new_drone_company, v_uid, now(), 'Flytting',
      'Flylogg flyttet hit',
      'Flylogg ' || left(p_flight_log_id::text, 8) || ' (' || to_char(v_log.flight_date, 'YYYY-MM-DD') ||
      ') ble flyttet hit' ||
      CASE WHEN v_old_drone_name IS NOT NULL AND v_old_drone_name <> ''
           THEN ' fra ' || v_old_drone_name ELSE '' END ||
      '. ' || round(v_hours, 2)::text || ' flytimer lagt til.');
  END IF;

  -- ---------- Pilot ----------
  IF v_pilot_changed THEN
    SELECT company_id INTO v_new_pilot_company FROM profiles WHERE id = p_pilot_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target pilot not found';
    END IF;
    IF NOT public.has_role(v_uid, 'superadmin')
       AND v_new_pilot_company IS NOT NULL
       AND NOT (v_new_pilot_company = ANY(COALESCE(v_visible, '{}'))
                OR public.can_user_access_company(v_uid, v_new_pilot_company)) THEN
      RAISE EXCEPTION 'Target pilot not accessible';
    END IF;

    UPDATE flight_logs SET user_id = p_pilot_id WHERE id = p_flight_log_id;

    IF EXISTS (SELECT 1 FROM flight_log_personnel
               WHERE flight_log_id = p_flight_log_id AND profile_id = v_old_pilot) THEN
      -- swap only the current pilot's row; other crew is untouched
      IF EXISTS (SELECT 1 FROM flight_log_personnel
                 WHERE flight_log_id = p_flight_log_id AND profile_id = p_pilot_id) THEN
        DELETE FROM flight_log_personnel
        WHERE flight_log_id = p_flight_log_id AND profile_id = v_old_pilot;
      ELSE
        UPDATE flight_log_personnel
        SET profile_id = p_pilot_id
        WHERE flight_log_id = p_flight_log_id AND profile_id = v_old_pilot;
      END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM flight_log_personnel
                      WHERE flight_log_id = p_flight_log_id AND profile_id = p_pilot_id) THEN
      INSERT INTO flight_log_personnel (flight_log_id, profile_id)
      VALUES (p_flight_log_id, p_pilot_id);
    END IF;

    -- Move personnel logbook entries linked to this flight (keep content, change owner)
    WITH movedp AS (
      UPDATE personnel_log_entries
      SET profile_id = p_pilot_id,
          company_id = COALESCE(v_new_pilot_company, company_id)
      WHERE flight_log_id = p_flight_log_id
        AND (v_old_pilot IS NULL OR profile_id = v_old_pilot)
      RETURNING 1
    )
    SELECT count(*) INTO v_moved_personnel FROM movedp;

    -- Traceability note for the new pilot
    INSERT INTO personnel_log_entries (profile_id, company_id, user_id, entry_date, entry_type, title, description, flight_log_id)
    VALUES (p_pilot_id, COALESCE(v_new_pilot_company, v_log.company_id), v_uid, now(), 'Notat',
      'Flylogg flyttet hit',
      'Flylogg ' || left(p_flight_log_id::text, 8) || ' (' || to_char(v_log.flight_date, 'YYYY-MM-DD') ||
      ') ble knyttet til deg som pilot.', p_flight_log_id);

    IF v_old_pilot IS NOT NULL THEN
      INSERT INTO personnel_log_entries (profile_id, company_id, user_id, entry_date, entry_type, title, description)
      SELECT v_old_pilot, COALESCE(pr.company_id, v_log.company_id), v_uid, now(), 'Notat',
        'Flylogg flyttet herfra',
        'Flylogg ' || left(p_flight_log_id::text, 8) || ' (' || to_char(v_log.flight_date, 'YYYY-MM-DD') ||
        ') ble flyttet til en annen pilot.'
      FROM profiles pr WHERE pr.id = v_old_pilot;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'changed', true,
    'drone_changed', v_drone_changed,
    'pilot_changed', v_pilot_changed,
    'hours_moved', round(v_hours, 3),
    'warnings_moved', v_moved_warnings,
    'personnel_entries_moved', v_moved_personnel
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_flight_log(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reassign_flight_log(uuid, uuid, uuid) TO authenticated;