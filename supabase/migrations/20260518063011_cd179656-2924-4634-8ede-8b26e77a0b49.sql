
-- Drone zones from Trafikstyrelsen (Denmark)
CREATE TABLE public.dk_drone_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id text NOT NULL,                 -- 'rod' | 'orange' | 'bla'
  geometry_type text NOT NULL,            -- 'point' | 'polygon'
  external_id text NOT NULL,              -- OBJECTID from source
  name text,
  category text,                          -- typeId / Type
  buffer text,                            -- Bufferzone
  icao text,
  elevation_m double precision,
  lower_limit_m double precision,
  upper_limit_m double precision,
  geometry geometry(Geometry, 4326) NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (layer_id, geometry_type, external_id)
);

CREATE INDEX dk_drone_zones_geom_idx ON public.dk_drone_zones USING GIST (geometry);
CREATE INDEX dk_drone_zones_layer_idx ON public.dk_drone_zones (layer_id);

ALTER TABLE public.dk_drone_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read dk_drone_zones"
ON public.dk_drone_zones FOR SELECT TO authenticated USING (true);

-- Nature areas (Naturområder)
CREATE TABLE public.dk_nature_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  theme text,                             -- Temanavn
  name text,                              -- area name
  restriction_period text,                -- Restriktionsperiode_
  reason text,                            -- Årsag
  active boolean NOT NULL DEFAULT true,
  source_url text,
  geometry geometry(Geometry, 4326) NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dk_nature_areas_geom_idx ON public.dk_nature_areas USING GIST (geometry);
CREATE INDEX dk_nature_areas_active_idx ON public.dk_nature_areas (active);

ALTER TABLE public.dk_nature_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read dk_nature_areas"
ON public.dk_nature_areas FOR SELECT TO authenticated USING (true);

-- updated_at triggers
CREATE TRIGGER trg_dk_drone_zones_updated_at
BEFORE UPDATE ON public.dk_drone_zones
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_dk_nature_areas_updated_at
BEFORE UPDATE ON public.dk_nature_areas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Viewport-bounded reads
CREATE OR REPLACE FUNCTION public.get_dk_drone_zones_in_bounds(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision,
  p_layer_ids text[]
)
RETURNS TABLE (
  id uuid,
  layer_id text,
  geometry_type text,
  external_id text,
  name text,
  category text,
  buffer text,
  icao text,
  elevation_m double precision,
  lower_limit_m double precision,
  upper_limit_m double precision,
  geometry jsonb,
  properties jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT z.id, z.layer_id, z.geometry_type, z.external_id, z.name, z.category,
         z.buffer, z.icao, z.elevation_m, z.lower_limit_m, z.upper_limit_m,
         ST_AsGeoJSON(z.geometry)::jsonb AS geometry,
         z.properties
  FROM public.dk_drone_zones z
  WHERE z.layer_id = ANY(p_layer_ids)
    AND z.geometry && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
  LIMIT 5000;
$$;

CREATE OR REPLACE FUNCTION public.get_dk_nature_areas_in_bounds(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision,
  p_include_inactive boolean DEFAULT true
)
RETURNS TABLE (
  id uuid,
  external_id text,
  theme text,
  name text,
  restriction_period text,
  reason text,
  active boolean,
  source_url text,
  geometry jsonb,
  properties jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.id, n.external_id, n.theme, n.name, n.restriction_period, n.reason,
         n.active, n.source_url,
         ST_AsGeoJSON(n.geometry)::jsonb AS geometry,
         n.properties
  FROM public.dk_nature_areas n
  WHERE (p_include_inactive OR n.active)
    AND n.geometry && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
  LIMIT 5000;
$$;

GRANT EXECUTE ON FUNCTION public.get_dk_drone_zones_in_bounds(double precision, double precision, double precision, double precision, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dk_nature_areas_in_bounds(double precision, double precision, double precision, double precision, boolean) TO authenticated;
