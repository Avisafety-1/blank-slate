CREATE OR REPLACE FUNCTION public.get_obstacles_in_bounds(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision
) RETURNS TABLE (
  openaip_id text,
  name text,
  type text,
  elevation numeric,
  height_agl numeric,
  lat double precision,
  lng double precision
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT openaip_id, name, type, elevation, height_agl,
         ST_Y(geometry)::double precision AS lat,
         ST_X(geometry)::double precision AS lng
  FROM public.openaip_obstacles
  WHERE geometry && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
  LIMIT 1000;
$$;

GRANT EXECUTE ON FUNCTION public.get_obstacles_in_bounds(double precision,double precision,double precision,double precision) TO authenticated;