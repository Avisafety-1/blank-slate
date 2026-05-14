CREATE OR REPLACE FUNCTION public.sync_mission_map_publication()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_defaults RECORD;
  v_publish boolean;
  v_share boolean;
  v_anon boolean;
  v_geom geometry(MultiPolygon, 4326);
  v_center geometry(Point, 4326);
  v_coords jsonb;
  v_ring text;
  v_first jsonb;
  v_last jsonb;
  v_phone text;
  v_email text;
  v_name text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.mission_map_publications WHERE mission_id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT default_publish_planned_missions, default_share_contact_info,
         default_anonymous_publish, allow_pilot_override_publish_settings
    INTO v_company_defaults
    FROM public.companies WHERE id = NEW.company_id;

  IF v_company_defaults.allow_pilot_override_publish_settings THEN
    v_publish := COALESCE(NEW.publish_to_map, v_company_defaults.default_publish_planned_missions);
    v_share   := COALESCE(NEW.share_contact_info, v_company_defaults.default_share_contact_info);
    v_anon    := COALESCE(NEW.anonymous_publish, v_company_defaults.default_anonymous_publish);
  ELSE
    v_publish := v_company_defaults.default_publish_planned_missions;
    v_share   := v_company_defaults.default_share_contact_info;
    v_anon    := v_company_defaults.default_anonymous_publish;
  END IF;

  IF NOT v_publish THEN
    DELETE FROM public.mission_map_publications WHERE mission_id = NEW.id;
    RETURN NEW;
  END IF;

  v_coords := NEW.route -> 'coordinates';
  IF v_coords IS NOT NULL AND jsonb_typeof(v_coords) = 'array' AND jsonb_array_length(v_coords) >= 3 THEN
    SELECT string_agg((pt->>'lng') || ' ' || (pt->>'lat'), ',' ORDER BY ord)
      INTO v_ring
      FROM jsonb_array_elements(v_coords) WITH ORDINALITY AS t(pt, ord);

    v_first := v_coords -> 0;
    v_last  := v_coords -> (jsonb_array_length(v_coords) - 1);
    IF (v_first->>'lat') <> (v_last->>'lat') OR (v_first->>'lng') <> (v_last->>'lng') THEN
      v_ring := v_ring || ',' || (v_first->>'lng') || ' ' || (v_first->>'lat');
    END IF;

    BEGIN
      v_geom := ST_Multi(ST_SetSRID(ST_GeomFromText('POLYGON((' || v_ring || '))'), 4326));
      v_center := ST_Centroid(v_geom);
    EXCEPTION WHEN OTHERS THEN
      v_geom := NULL;
      v_center := NULL;
    END;
  END IF;

  IF v_center IS NULL AND NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    v_center := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;

  -- Pilotkontakt: missions.user_id = oppdragseier
  SELECT telefon, email, COALESCE(NULLIF(trim(full_name), ''), NULLIF(trim(display_name), ''))
    INTO v_phone, v_email, v_name
    FROM public.profiles WHERE id = NEW.user_id;

  v_phone := COALESCE(NEW.pilot_contact_phone_snapshot, v_phone);

  INSERT INTO public.mission_map_publications (
    mission_id, company_id, visibility,
    publish_to_map, anonymous_publish, share_contact_info,
    public_title, public_description,
    public_contact_name, public_contact_phone, public_contact_email,
    geometry, center, starts_at, ends_at,
    visible_from, visible_until, status, updated_at
  ) VALUES (
    NEW.id, NEW.company_id, 'internal',
    v_publish, v_anon, v_share,
    CASE WHEN v_anon THEN NULL ELSE NEW.tittel END,
    CASE WHEN v_anon THEN NULL ELSE NEW.beskrivelse END,
    CASE WHEN v_share AND NOT v_anon THEN v_name END,
    CASE WHEN v_share AND NOT v_anon THEN v_phone END,
    CASE WHEN v_share AND NOT v_anon THEN v_email END,
    v_geom, v_center, NEW.tidspunkt, NEW.slutt_tidspunkt,
    COALESCE(NEW.tidspunkt - interval '24 hours', now()),
    COALESCE(NEW.slutt_tidspunkt, NEW.tidspunkt + interval '24 hours'),
    NEW.status, now()
  )
  ON CONFLICT (mission_id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    publish_to_map = EXCLUDED.publish_to_map,
    anonymous_publish = EXCLUDED.anonymous_publish,
    share_contact_info = EXCLUDED.share_contact_info,
    public_title = EXCLUDED.public_title,
    public_description = EXCLUDED.public_description,
    public_contact_name = EXCLUDED.public_contact_name,
    public_contact_phone = EXCLUDED.public_contact_phone,
    public_contact_email = EXCLUDED.public_contact_email,
    geometry = EXCLUDED.geometry,
    center = EXCLUDED.center,
    starts_at = EXCLUDED.starts_at,
    ends_at = EXCLUDED.ends_at,
    visible_from = EXCLUDED.visible_from,
    visible_until = EXCLUDED.visible_until,
    status = EXCLUDED.status,
    updated_at = now();

  RETURN NEW;
END;
$function$;