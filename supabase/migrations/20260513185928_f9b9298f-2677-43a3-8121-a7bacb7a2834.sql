-- 1. Selskaps-defaults
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS default_publish_planned_missions boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_share_contact_info boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_anonymous_publish boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_pilot_override_publish_settings boolean NOT NULL DEFAULT true;

-- 2. Per-mission overrides
ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS publish_to_map boolean,
  ADD COLUMN IF NOT EXISTS share_contact_info boolean,
  ADD COLUMN IF NOT EXISTS anonymous_publish boolean,
  ADD COLUMN IF NOT EXISTS pilot_contact_phone_snapshot text;

-- 3. Publiseringstabell
CREATE TABLE IF NOT EXISTS public.mission_map_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL UNIQUE REFERENCES public.missions(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  visibility text NOT NULL DEFAULT 'internal'
    CHECK (visibility IN ('internal','public','hidden')),
  publish_to_map boolean NOT NULL DEFAULT true,
  anonymous_publish boolean NOT NULL DEFAULT false,
  share_contact_info boolean NOT NULL DEFAULT true,
  public_title text,
  public_description text,
  public_contact_name text,
  public_contact_phone text,
  public_contact_email text,
  geometry geometry(MultiPolygon, 4326),
  center geometry(Point, 4326),
  starts_at timestamptz,
  ends_at timestamptz,
  visible_from timestamptz,
  visible_until timestamptz,
  status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mmp_geometry_gist ON public.mission_map_publications USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_mmp_visible_window ON public.mission_map_publications (visible_from, visible_until);
CREATE INDEX IF NOT EXISTS idx_mmp_company ON public.mission_map_publications (company_id);
CREATE INDEX IF NOT EXISTS idx_mmp_status ON public.mission_map_publications (status);

-- 4. Trigger: snapshot fra missions
CREATE OR REPLACE FUNCTION public.sync_mission_map_publication()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  SELECT phone, email, COALESCE(NULLIF(trim(full_name), ''), NULLIF(trim(display_name), ''))
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
$$;

DROP TRIGGER IF EXISTS trg_sync_mission_map_publication ON public.missions;
CREATE TRIGGER trg_sync_mission_map_publication
AFTER INSERT OR UPDATE OR DELETE ON public.missions
FOR EACH ROW EXECUTE FUNCTION public.sync_mission_map_publication();

-- 5. RLS
ALTER TABLE public.mission_map_publications ENABLE ROW LEVEL SECURITY;

-- BEVISST FASE 1-VALG: alle innloggede AviSafe-brukere ser publiserte planlagte
-- oppdrag på tvers av selskap, men kun innenfor synlighetsvinduet.
DROP POLICY IF EXISTS "authenticated read internal published"
  ON public.mission_map_publications;
CREATE POLICY "authenticated read internal published"
ON public.mission_map_publications
FOR SELECT
TO authenticated
USING (
  publish_to_map = true
  AND visibility = 'internal'
  AND status NOT IN ('Pågående','Fullført','Avbrutt')
  AND now() BETWEEN visible_from AND visible_until
);

-- 6. Konflikt-RPC (SECURITY INVOKER — respekterer RLS)
CREATE OR REPLACE FUNCTION public.check_planned_mission_conflicts(
  p_geom_geojson jsonb,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_exclude_mission_id uuid DEFAULT NULL,
  p_window_hours integer DEFAULT 2
)
RETURNS TABLE (
  mission_id uuid,
  company_id uuid,
  public_title text,
  starts_at timestamptz,
  ends_at timestamptz,
  public_contact_name text,
  public_contact_phone text,
  public_contact_email text,
  anonymous_publish boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH input AS (
    SELECT ST_SetSRID(ST_GeomFromGeoJSON(p_geom_geojson::text), 4326) AS g
  )
  SELECT m.mission_id, m.company_id, m.public_title,
         m.starts_at, m.ends_at,
         m.public_contact_name, m.public_contact_phone, m.public_contact_email,
         m.anonymous_publish
  FROM public.mission_map_publications m, input
  WHERE m.publish_to_map = true
    AND m.status NOT IN ('Pågående','Fullført','Avbrutt')
    AND (p_exclude_mission_id IS NULL OR m.mission_id <> p_exclude_mission_id)
    AND m.geometry IS NOT NULL
    AND ST_Intersects(m.geometry, input.g)
    AND tstzrange(
          m.starts_at - make_interval(hours => p_window_hours),
          m.ends_at   + make_interval(hours => p_window_hours),
          '[]'
        ) && tstzrange(p_starts_at, p_ends_at, '[]');
$$;