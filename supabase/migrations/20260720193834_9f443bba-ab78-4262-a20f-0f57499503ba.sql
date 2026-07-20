CREATE OR REPLACE FUNCTION public.get_obstacles_in_bounds(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision
)
RETURNS TABLE (
  openaip_id text,
  name text,
  type text,
  lat double precision,
  lng double precision,
  elevation double precision,
  height_agl double precision,
  properties jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.openaip_id,
    o.name,
    o.type,
    ST_Y(o.geometry::geometry)::double precision AS lat,
    ST_X(o.geometry::geometry)::double precision AS lng,
    o.elevation,
    o.height_agl,
    o.properties
  FROM public.openaip_obstacles o
  WHERE o.geometry && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
  LIMIT 20000;
$$;

GRANT EXECUTE ON FUNCTION public.get_obstacles_in_bounds(double precision,double precision,double precision,double precision) TO anon, authenticated, service_role;