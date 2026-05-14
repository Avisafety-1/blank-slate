ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS public_company_name TEXT;
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS oppdragstype TEXT, ADD COLUMN IF NOT EXISTS oppdragstype_annet TEXT;
ALTER TABLE public.mission_map_publications ADD COLUMN IF NOT EXISTS public_company_name TEXT, ADD COLUMN IF NOT EXISTS public_mission_type TEXT;

CREATE OR REPLACE FUNCTION public.get_root_public_company_name(_company_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_current uuid := _company_id;
  v_parent uuid;
  v_root_id uuid := _company_id;
  v_public_name text;
  v_navn text;
  v_guard int := 0;
BEGIN
  IF _company_id IS NULL THEN RETURN NULL; END IF;
  LOOP
    v_guard := v_guard + 1;
    EXIT WHEN v_guard > 20;
    SELECT parent_company_id INTO v_parent FROM public.companies WHERE id = v_current;
    IF v_parent IS NULL THEN
      v_root_id := v_current;
      EXIT;
    END IF;
    v_current := v_parent;
  END LOOP;
  SELECT NULLIF(trim(public_company_name), ''), NULLIF(trim(navn), '')
    INTO v_public_name, v_navn
    FROM public.companies WHERE id = v_root_id;
  RETURN COALESCE(v_public_name, v_navn);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_mission_map_publication()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_company_defaults RECORD;
  v_publish boolean; v_share boolean; v_anon boolean;
  v_geom geometry(MultiPolygon, 4326);
  v_center geometry(Point, 4326);
  v_coords jsonb; v_ring text; v_first jsonb; v_last jsonb;
  v_phone text; v_email text; v_name text;
  v_starts timestamptz; v_ends timestamptz;
  v_company_name text; v_mission_type text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.mission_map_publications WHERE mission_id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT default_publish_planned_missions, default_share_contact_info,
         default_anonymous_publish, allow_pilot_override_publish_settings
    INTO v_company_defaults FROM public.companies WHERE id = NEW.company_id;

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
    SELECT string_agg((pt->>'lng') || ' ' || (pt->>'lat'), ',' ORDER BY ord) INTO v_ring
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
      v_geom := NULL; v_center := NULL;
    END;
  END IF;

  IF v_center IS NULL AND NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    v_center := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;

  SELECT telefon, email, NULLIF(trim(full_name), '')
    INTO v_phone, v_email, v_name FROM public.profiles WHERE id = NEW.user_id;
  v_phone := COALESCE(NEW.pilot_contact_phone_snapshot, v_phone);

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
    CASE WHEN v_share AND NOT v_anon THEN v_name END,
    CASE WHEN v_share AND NOT v_anon THEN v_phone END,
    CASE WHEN v_share AND NOT v_anon THEN v_email END,
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

DROP VIEW IF EXISTS public.v_planned_mission_map;
CREATE VIEW public.v_planned_mission_map
WITH (security_invoker = true) AS
SELECT
  p.id, p.mission_id, p.company_id,
  p.publish_to_map, p.visibility,
  p.anonymous_publish, p.share_contact_info,
  p.public_title, p.public_description,
  p.public_contact_name, p.public_contact_phone, p.public_contact_email,
  p.public_company_name, p.public_mission_type,
  p.starts_at, p.ends_at, p.visible_from, p.visible_until, p.status,
  ST_AsGeoJSON(p.geometry)::jsonb AS geometry_geojson,
  ST_AsGeoJSON(p.center)::jsonb   AS center_geojson
FROM public.mission_map_publications p
WHERE p.publish_to_map = true;
GRANT SELECT ON public.v_planned_mission_map TO authenticated;

UPDATE public.missions SET oppdatert_dato = oppdatert_dato
  WHERE id IN (SELECT mission_id FROM public.mission_map_publications);
