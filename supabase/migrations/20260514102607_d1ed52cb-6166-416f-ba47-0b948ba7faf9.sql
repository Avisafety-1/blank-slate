
-- 1. Granular contact-sharing toggles on companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS default_share_contact_name  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_share_contact_phone boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_share_contact_email boolean NOT NULL DEFAULT true;

-- 2. Snapshot fields for name/email (phone snapshot already exists)
ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS pilot_contact_name_snapshot  text,
  ADD COLUMN IF NOT EXISTS pilot_contact_email_snapshot text;

-- 3. Hardened trigger: fallbacks, ST_MakeValid + ST_PointOnSurface,
--    granular contact toggles, coordinate validation, name/email snapshot.
CREATE OR REPLACE FUNCTION public.sync_mission_map_publication()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_defaults RECORD;
  v_publish boolean; v_share boolean; v_anon boolean;
  v_share_name boolean; v_share_phone boolean; v_share_email boolean;
  v_geom geometry(MultiPolygon, 4326);
  v_geom_raw geometry;
  v_center geometry(Point, 4326);
  v_coords jsonb; v_ring text; v_first jsonb; v_last jsonb;
  v_phone text; v_email text; v_name text;
  v_starts timestamptz; v_ends timestamptz;
  v_company_name text; v_mission_type text;
  v_lat numeric; v_lng numeric;
  v_valid_coords boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.mission_map_publications WHERE mission_id = OLD.id;
    RETURN OLD;
  END IF;

  -- Read company defaults; fall back to safe defaults if row missing
  SELECT default_publish_planned_missions,
         default_share_contact_info,
         default_anonymous_publish,
         allow_pilot_override_publish_settings,
         default_share_contact_name,
         default_share_contact_phone,
         default_share_contact_email
    INTO v_company_defaults
    FROM public.companies
    WHERE id = NEW.company_id;

  IF NOT FOUND THEN
    v_company_defaults.default_publish_planned_missions     := false;
    v_company_defaults.default_share_contact_info           := false;
    v_company_defaults.default_anonymous_publish            := false;
    v_company_defaults.allow_pilot_override_publish_settings := true;
    v_company_defaults.default_share_contact_name           := true;
    v_company_defaults.default_share_contact_phone          := true;
    v_company_defaults.default_share_contact_email          := true;
  END IF;

  IF COALESCE(v_company_defaults.allow_pilot_override_publish_settings, true) THEN
    v_publish := COALESCE(NEW.publish_to_map,    v_company_defaults.default_publish_planned_missions, false);
    v_share   := COALESCE(NEW.share_contact_info, v_company_defaults.default_share_contact_info,      false);
    v_anon    := COALESCE(NEW.anonymous_publish,  v_company_defaults.default_anonymous_publish,       false);
  ELSE
    v_publish := COALESCE(v_company_defaults.default_publish_planned_missions, false);
    v_share   := COALESCE(v_company_defaults.default_share_contact_info,      false);
    v_anon    := COALESCE(v_company_defaults.default_anonymous_publish,       false);
  END IF;

  v_share_name  := COALESCE(v_company_defaults.default_share_contact_name,  true);
  v_share_phone := COALESCE(v_company_defaults.default_share_contact_phone, true);
  v_share_email := COALESCE(v_company_defaults.default_share_contact_email, true);

  IF NOT v_publish THEN
    DELETE FROM public.mission_map_publications WHERE mission_id = NEW.id;
    RETURN NEW;
  END IF;

  -- Build polygon geometry from route, validate coordinates strictly
  v_coords := NEW.route -> 'coordinates';
  IF v_coords IS NOT NULL AND jsonb_typeof(v_coords) = 'array' AND jsonb_array_length(v_coords) >= 3 THEN
    v_valid_coords := true;
    -- Validate every coordinate is numeric and within bounds
    FOR v_first IN SELECT * FROM jsonb_array_elements(v_coords) LOOP
      BEGIN
        v_lat := (v_first->>'lat')::numeric;
        v_lng := (v_first->>'lng')::numeric;
      EXCEPTION WHEN OTHERS THEN
        v_valid_coords := false; EXIT;
      END;
      IF v_lat IS NULL OR v_lng IS NULL
         OR v_lat < -90 OR v_lat > 90
         OR v_lng < -180 OR v_lng > 180 THEN
        v_valid_coords := false; EXIT;
      END IF;
    END LOOP;

    IF v_valid_coords THEN
      SELECT string_agg((pt->>'lng') || ' ' || (pt->>'lat'), ',' ORDER BY ord) INTO v_ring
        FROM jsonb_array_elements(v_coords) WITH ORDINALITY AS t(pt, ord);
      v_first := v_coords -> 0;
      v_last  := v_coords -> (jsonb_array_length(v_coords) - 1);
      IF (v_first->>'lat') <> (v_last->>'lat') OR (v_first->>'lng') <> (v_last->>'lng') THEN
        v_ring := v_ring || ',' || (v_first->>'lng') || ' ' || (v_first->>'lat');
      END IF;
      BEGIN
        v_geom_raw := ST_SetSRID(ST_GeomFromText('POLYGON((' || v_ring || '))'), 4326);
        v_geom_raw := ST_MakeValid(v_geom_raw);
        -- ST_MakeValid may return GeometryCollection; keep only polygonal parts
        IF GeometryType(v_geom_raw) = 'GEOMETRYCOLLECTION' THEN
          v_geom_raw := ST_CollectionExtract(v_geom_raw, 3);
        END IF;
        v_geom := ST_Multi(v_geom_raw);
        v_center := ST_PointOnSurface(v_geom);
      EXCEPTION WHEN OTHERS THEN
        v_geom := NULL; v_center := NULL;
      END;
    END IF;
  END IF;

  -- Fallback to mission lat/lng (validated) if no polygon
  IF v_center IS NULL
     AND NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL
     AND NEW.latitude BETWEEN -90 AND 90
     AND NEW.longitude BETWEEN -180 AND 180 THEN
    v_center := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;

  -- Resolve contact info: prefer snapshot, fall back to current profile
  SELECT telefon, email, NULLIF(trim(full_name), '')
    INTO v_phone, v_email, v_name
    FROM public.profiles WHERE id = NEW.user_id;

  v_phone := COALESCE(NEW.pilot_contact_phone_snapshot, v_phone);
  v_email := COALESCE(NEW.pilot_contact_email_snapshot, v_email);
  v_name  := COALESCE(NEW.pilot_contact_name_snapshot,  v_name);

  v_starts := COALESCE(NEW.tidspunkt, now());
  v_ends   := COALESCE(NEW.slutt_tidspunkt, v_starts + interval '24 hours');

  v_company_name := public.get_root_public_company_name(NEW.company_id);
  IF NEW.oppdragstype IS NOT NULL AND lower(NEW.oppdragstype) = 'annet' THEN
    v_mission_type := NULLIF(trim(NEW.oppdragstype_annet), '');
  ELSE
    v_mission_type := NULLIF(trim(NEW.oppdragstype), '');
  END IF;

  INSERT INTO public.mission_map_publications (
    mission_id, company_id, visibility,
    publish_to_map, anonymous_publish, share_contact_info,
    public_title, public_description,
    public_contact_name, public_contact_phone, public_contact_email,
    public_company_name, public_mission_type,
    geometry, center, starts_at, ends_at,
    visible_from, visible_until, status, updated_at
  ) VALUES (
    NEW.id, NEW.company_id, 'internal',
    v_publish, v_anon, v_share,
    CASE WHEN v_anon THEN NULL ELSE NEW.tittel END,
    CASE WHEN v_anon THEN NULL ELSE NEW.beskrivelse END,
    CASE WHEN v_share AND NOT v_anon AND v_share_name  THEN v_name  END,
    CASE WHEN v_share AND NOT v_anon AND v_share_phone THEN v_phone END,
    CASE WHEN v_share AND NOT v_anon AND v_share_email THEN v_email END,
    CASE WHEN v_anon THEN NULL ELSE v_company_name END,
    CASE WHEN v_anon THEN NULL ELSE v_mission_type END,
    v_geom, v_center, v_starts, v_ends,
    LEAST(now(), v_starts - interval '24 hours'),
    v_ends, NEW.status, now()
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
    public_company_name = EXCLUDED.public_company_name,
    public_mission_type = EXCLUDED.public_mission_type,
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
