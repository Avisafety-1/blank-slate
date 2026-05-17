CREATE OR REPLACE FUNCTION public.get_caa_zones_geojson(p_layer_id text)
RETURNS TABLE(external_id text, geometry_geojson jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT external_id, ST_AsGeoJSON(geometry)::jsonb
  FROM caa_drone_zones
  WHERE layer_id = p_layer_id
    AND geometry IS NOT NULL
    AND external_id IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.get_caa_zones_geojson(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_caa_zones_geojson(text) TO authenticated, service_role;