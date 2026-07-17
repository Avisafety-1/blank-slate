
-- =====================================================================
-- Fase A1: Unified European Airspace schema (additive only)
-- =====================================================================

CREATE TABLE public.airspace_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  country_code text NOT NULL,
  source text NOT NULL,
  external_id text NOT NULL,

  zone_type text NOT NULL,
  restriction_type text NOT NULL,
  display_class text NOT NULL,
  theme text,

  name text NOT NULL,
  short_name text,
  authority text,

  lower_limit_m integer,
  upper_limit_m integer,
  lower_limit_raw text,
  upper_limit_raw text,
  altitude_reference text,

  valid_from timestamptz,
  valid_to timestamptz,
  active boolean NOT NULL DEFAULT true,

  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  geom geometry(Geometry, 4326) NOT NULL,

  CONSTRAINT airspace_zones_country_code_chk
    CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT airspace_zones_zone_type_chk
    CHECK (zone_type IN (
      'CTR','TIZ','TMZ','RMZ','ATZ',
      'P','R','D',
      'RPAS_5KM','ATZ_5KM',
      'NSM','NATURE','NOTAM','OBSTACLE','POWERLINE','OTHER'
    )),
  CONSTRAINT airspace_zones_restriction_type_chk
    CHECK (restriction_type IN (
      'PROHIBITED','RESTRICTED','APPROVAL_REQUIRED',
      'NOTIFICATION','INFO','NATURE_SENSITIVE'
    )),
  CONSTRAINT airspace_zones_display_class_chk
    CHECK (display_class IN ('RED','AMBER','BLUE','GREEN','GREY')),
  CONSTRAINT airspace_zones_altitude_reference_chk
    CHECK (altitude_reference IS NULL OR altitude_reference IN
      ('AMSL','AGL','FL','SFC','UNL')),
  CONSTRAINT airspace_zones_geom_type_chk
    CHECK (ST_GeometryType(geom) IN (
      'ST_Point','ST_MultiPoint',
      'ST_LineString','ST_MultiLineString',
      'ST_Polygon','ST_MultiPolygon'
    )),
  CONSTRAINT airspace_zones_geom_not_empty_chk
    CHECK (NOT ST_IsEmpty(geom))
);

CREATE UNIQUE INDEX airspace_zones_source_country_external_id_key
  ON public.airspace_zones (source, country_code, external_id);

CREATE INDEX airspace_zones_geom_gix
  ON public.airspace_zones USING GIST (geom);
CREATE INDEX airspace_zones_geography_gix
  ON public.airspace_zones USING GIST ((geom::geography));
CREATE INDEX airspace_zones_country_type_idx
  ON public.airspace_zones (country_code, zone_type)
  WHERE active = true;
CREATE INDEX airspace_zones_active_idx
  ON public.airspace_zones (active);

GRANT SELECT ON public.airspace_zones TO authenticated;
GRANT ALL ON public.airspace_zones TO service_role;

ALTER TABLE public.airspace_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read active airspace zones"
  ON public.airspace_zones
  FOR SELECT
  TO authenticated
  USING (active = true);

CREATE POLICY "Service role manages airspace zones"
  ON public.airspace_zones
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER trg_airspace_zones_updated_at
  BEFORE UPDATE ON public.airspace_zones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- airspace_sync_runs ----------
CREATE TABLE public.airspace_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),

  source text NOT NULL,
  country_code text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',

  fetched_count integer NOT NULL DEFAULT 0,
  valid_count integer NOT NULL DEFAULT 0,
  upserted_count integer NOT NULL DEFAULT 0,
  deactivated_count integer NOT NULL DEFAULT 0,

  error text,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT airspace_sync_runs_status_chk
    CHECK (status IN ('running','success','failed','aborted'))
);

CREATE INDEX airspace_sync_runs_source_started_idx
  ON public.airspace_sync_runs (source, started_at DESC);
CREATE INDEX airspace_sync_runs_status_idx
  ON public.airspace_sync_runs (status);

GRANT ALL ON public.airspace_sync_runs TO service_role;

ALTER TABLE public.airspace_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages sync runs"
  ON public.airspace_sync_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------- app_config flags ----------
INSERT INTO public.app_config (key, value) VALUES
  ('airspace_unified_dk_enabled', 'false'::jsonb),
  ('airspace_unified_shadow_logging', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------- RPC: airspace_zones_in_bbox ----------
CREATE OR REPLACE FUNCTION public.airspace_zones_in_bbox(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_zone_types text[] DEFAULT NULL,
  p_country_codes text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  country_code text,
  source text,
  zone_type text,
  restriction_type text,
  display_class text,
  theme text,
  name text,
  short_name text,
  lower_limit_m integer,
  upper_limit_m integer,
  altitude_reference text,
  geometry_geojson jsonb,
  properties jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    z.id, z.country_code, z.source, z.zone_type, z.restriction_type,
    z.display_class, z.theme, z.name, z.short_name,
    z.lower_limit_m, z.upper_limit_m, z.altitude_reference,
    ST_AsGeoJSON(z.geom)::jsonb AS geometry_geojson,
    z.properties
  FROM public.airspace_zones z
  WHERE z.active = true
    AND (z.valid_from IS NULL OR z.valid_from <= now())
    AND (z.valid_to   IS NULL OR z.valid_to   >  now())
    AND z.geom && ST_MakeEnvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)
    AND (p_zone_types IS NULL OR z.zone_type = ANY(p_zone_types))
    AND (p_country_codes IS NULL OR z.country_code = ANY(p_country_codes))
$$;

REVOKE ALL ON FUNCTION public.airspace_zones_in_bbox(
  double precision, double precision, double precision, double precision, text[], text[]
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.airspace_zones_in_bbox(
  double precision, double precision, double precision, double precision, text[], text[]
) TO authenticated, service_role;

-- ---------- RPC: airspace_zones_intersecting_route ----------
CREATE OR REPLACE FUNCTION public.airspace_zones_intersecting_route(
  p_route jsonb,
  p_buffer_m integer DEFAULT 0,
  p_zone_types text[] DEFAULT NULL,
  p_country_codes text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  country_code text,
  source text,
  zone_type text,
  restriction_type text,
  display_class text,
  theme text,
  name text,
  short_name text,
  lower_limit_m integer,
  upper_limit_m integer,
  altitude_reference text,
  distance_m double precision,
  route_inside boolean,
  properties jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_route geometry;
  v_type  text;
  v_buffer integer;
BEGIN
  IF p_route IS NULL THEN
    RAISE EXCEPTION 'p_route must not be null';
  END IF;

  BEGIN
    v_route := ST_SetSRID(ST_GeomFromGeoJSON(p_route::text), 4326);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'p_route is not valid GeoJSON geometry';
  END;

  IF v_route IS NULL OR ST_IsEmpty(v_route) THEN
    RAISE EXCEPTION 'p_route geometry is empty';
  END IF;

  v_type := ST_GeometryType(v_route);
  IF v_type NOT IN ('ST_LineString','ST_MultiLineString') THEN
    RAISE EXCEPTION 'p_route must be LineString or MultiLineString (got %)', v_type;
  END IF;

  v_buffer := GREATEST(COALESCE(p_buffer_m, 0), 0);
  IF v_buffer > 100000 THEN
    RAISE EXCEPTION 'p_buffer_m must be <= 100000 meters (got %)', v_buffer;
  END IF;

  RETURN QUERY
  SELECT
    z.id, z.country_code, z.source, z.zone_type, z.restriction_type,
    z.display_class, z.theme, z.name, z.short_name,
    z.lower_limit_m, z.upper_limit_m, z.altitude_reference,
    ST_Distance(z.geom::geography, v_route::geography) AS distance_m,
    ST_Intersects(z.geom, v_route) AS route_inside,
    z.properties
  FROM public.airspace_zones z
  WHERE z.active = true
    AND (z.valid_from IS NULL OR z.valid_from <= now())
    AND (z.valid_to   IS NULL OR z.valid_to   >  now())
    AND (p_zone_types IS NULL OR z.zone_type = ANY(p_zone_types))
    AND (p_country_codes IS NULL OR z.country_code = ANY(p_country_codes))
    AND ST_DWithin(z.geom::geography, v_route::geography, v_buffer);
END;
$$;

REVOKE ALL ON FUNCTION public.airspace_zones_intersecting_route(
  jsonb, integer, text[], text[]
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.airspace_zones_intersecting_route(
  jsonb, integer, text[], text[]
) TO authenticated, service_role;
