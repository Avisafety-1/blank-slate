CREATE OR REPLACE FUNCTION public.airspace_zones_raw_in_bbox(
  p_min_lng double precision, p_min_lat double precision,
  p_max_lng double precision, p_max_lat double precision,
  p_country_codes text[] DEFAULT NULL
)
RETURNS TABLE(id uuid, country_code text, source text, external_id text, layer_id text)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT z.id, z.country_code, z.source, z.external_id, z.layer_id
    FROM public.airspace_zones z
   WHERE z.active
     AND ST_Intersects(z.geom, ST_MakeEnvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326))
     AND (p_country_codes IS NULL OR z.country_code = ANY(p_country_codes));
$$;
REVOKE ALL ON FUNCTION public.airspace_zones_raw_in_bbox(double precision,double precision,double precision,double precision,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.airspace_zones_raw_in_bbox(double precision,double precision,double precision,double precision,text[]) TO authenticated, service_role;