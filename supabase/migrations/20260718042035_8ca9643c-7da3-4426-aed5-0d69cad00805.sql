CREATE OR REPLACE FUNCTION public.airspace_zones_intersecting_route(
  p_route jsonb,
  p_buffer_m integer,
  p_zone_types text[] DEFAULT NULL::text[],
  p_country_codes text[] DEFAULT NULL::text[],
  p_layer_ids text[] DEFAULT NULL::text[]
)
RETURNS TABLE(
  id uuid,
  country_code text,
  source text,
  layer_id text,
  zone_type text,
  restriction_type text,
  display_class text,
  theme text,
  name text,
  short_name text,
  lower_limit_m integer,
  upper_limit_m integer,
  altitude_reference text,
  authority_rank smallint,
  dedupe_key text,
  distance_m double precision,
  route_inside boolean,
  properties jsonb
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_route geometry;
  v_buffer integer;
  v_center_lat double precision;
  v_degree_padding double precision;
BEGIN
  v_buffer := LEAST(GREATEST(COALESCE(p_buffer_m, 0), 0), 100000);
  v_route  := ST_SetSRID(ST_GeomFromGeoJSON(p_route::text), 4326);
  v_center_lat := ST_Y(ST_Centroid(ST_Envelope(v_route)));
  v_degree_padding := GREATEST(
    v_buffer / 111320.0,
    v_buffer / GREATEST(1.0, 111320.0 * ABS(COS(RADIANS(v_center_lat))))
  );

  RETURN QUERY
  WITH candidates AS (
    SELECT z.id AS z_id, z.country_code AS z_country_code, z.source AS z_source,
           z.layer_id AS z_layer_id, z.zone_type AS z_zone_type, z.restriction_type AS z_restriction_type,
           z.display_class AS z_display_class, z.theme AS z_theme, z.name AS z_name, z.short_name AS z_short_name,
           z.lower_limit_m AS z_lower_limit_m, z.upper_limit_m AS z_upper_limit_m, z.altitude_reference AS z_altitude_reference,
           z.authority_rank AS z_authority_rank, z.dedupe_key AS z_dedupe_key, z.properties AS z_properties,
           z.geom AS z_geom, z.updated_at AS z_updated_at
      FROM public.airspace_zones z
     WHERE z.active
       AND (z.valid_from IS NULL OR z.valid_from <= now())
       AND (z.valid_to   IS NULL OR z.valid_to   >  now())
       AND (p_country_codes IS NULL OR z.country_code = ANY(p_country_codes))
       AND (p_layer_ids     IS NULL OR z.layer_id     = ANY(p_layer_ids))
       AND (p_zone_types    IS NULL OR z.zone_type    = ANY(p_zone_types))
       -- Cheap geometry bbox prefilter first so the geom GIST index can reduce
       -- candidates before the more expensive geography distance calculation.
       AND z.geom && ST_Expand(v_route, v_degree_padding)
       AND ST_DWithin(z.geom::geography, v_route::geography, v_buffer)
  ), deduped AS (
    SELECT DISTINCT ON (c.z_country_code, c.z_layer_id, COALESCE(c.z_dedupe_key, c.z_id::text))
           c.z_id, c.z_country_code, c.z_source, c.z_layer_id, c.z_zone_type, c.z_restriction_type,
           c.z_display_class, c.z_theme, c.z_name, c.z_short_name,
           c.z_lower_limit_m, c.z_upper_limit_m, c.z_altitude_reference,
           c.z_authority_rank, c.z_dedupe_key, c.z_properties, c.z_geom
      FROM candidates c
     ORDER BY c.z_country_code, c.z_layer_id, COALESCE(c.z_dedupe_key, c.z_id::text),
              c.z_authority_rank NULLS LAST, c.z_updated_at DESC
  )
  SELECT d.z_id, d.z_country_code, d.z_source, d.z_layer_id, d.z_zone_type, d.z_restriction_type,
         d.z_display_class, d.z_theme, d.z_name, d.z_short_name,
         d.z_lower_limit_m, d.z_upper_limit_m, d.z_altitude_reference,
         d.z_authority_rank, d.z_dedupe_key,
         ST_Distance(d.z_geom::geography, v_route::geography) AS distance_m,
         ST_Intersects(d.z_geom, v_route)                     AS route_inside,
         d.z_properties
    FROM deduped d;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.airspace_zones_intersecting_route(jsonb, integer, text[], text[], text[]) TO anon, authenticated, service_role;