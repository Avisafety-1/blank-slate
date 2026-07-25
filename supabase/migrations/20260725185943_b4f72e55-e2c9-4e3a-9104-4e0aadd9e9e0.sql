CREATE OR REPLACE FUNCTION public.upsert_airspace_zones_pl(rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  n integer := 0;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(rows) LOOP
    INSERT INTO public.airspace_zones (
      country_code, source, external_id, zone_type, restriction_type, display_class, theme,
      name, short_name, authority, lower_limit_m, upper_limit_m,
      lower_limit_raw, upper_limit_raw, altitude_reference, active, properties, geom, layer_id
    ) VALUES (
      r->>'country_code',
      r->>'source',
      r->>'external_id',
      r->>'zone_type',
      r->>'restriction_type',
      r->>'display_class',
      r->>'theme',
      r->>'name',
      r->>'short_name',
      r->>'authority',
      NULLIF(r->>'lower_limit_m','')::integer,
      NULLIF(r->>'upper_limit_m','')::integer,
      r->>'lower_limit_raw',
      r->>'upper_limit_raw',
      r->>'altitude_reference',
      COALESCE((r->>'active')::boolean, true),
      COALESCE(r->'properties', '{}'::jsonb),
      ST_Multi(ST_SetSRID(ST_GeomFromText(r->>'_wkt'), 4326))::geometry,
      r->>'layer_id'
    )
    ON CONFLICT (source, country_code, external_id) DO UPDATE SET
      zone_type = EXCLUDED.zone_type,
      restriction_type = EXCLUDED.restriction_type,
      display_class = EXCLUDED.display_class,
      theme = EXCLUDED.theme,
      name = EXCLUDED.name,
      short_name = EXCLUDED.short_name,
      authority = EXCLUDED.authority,
      lower_limit_m = EXCLUDED.lower_limit_m,
      upper_limit_m = EXCLUDED.upper_limit_m,
      lower_limit_raw = EXCLUDED.lower_limit_raw,
      upper_limit_raw = EXCLUDED.upper_limit_raw,
      altitude_reference = EXCLUDED.altitude_reference,
      active = true,
      properties = EXCLUDED.properties,
      geom = EXCLUDED.geom,
      layer_id = EXCLUDED.layer_id,
      updated_at = now();
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_airspace_zones_pl(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_airspace_zones_pl(jsonb) TO service_role;