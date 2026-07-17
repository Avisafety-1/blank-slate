
-- 1. Support index for dedupe sort
CREATE INDEX IF NOT EXISTS airspace_zones_dedupe_ix
  ON public.airspace_zones (country_code, layer_id, dedupe_key, authority_rank)
  WHERE active;

-- 2. Rewrite resolved_airspace_zones view (preserve column order incl. precedence_rank)
CREATE OR REPLACE VIEW public.resolved_airspace_zones
WITH (security_invoker=on) AS
SELECT DISTINCT ON (z.country_code, z.layer_id, COALESCE(z.dedupe_key, z.id::text))
       z.id, z.created_at, z.updated_at, z.country_code, z.source,
       z.external_id, z.zone_type, z.restriction_type, z.display_class,
       z.theme, z.name, z.short_name, z.authority,
       z.lower_limit_m, z.upper_limit_m, z.lower_limit_raw, z.upper_limit_raw,
       z.altitude_reference, z.valid_from, z.valid_to, z.active,
       z.properties, z.geom, z.layer_id, z.authority_rank, z.dedupe_key,
       1::bigint AS precedence_rank
  FROM public.airspace_zones z
 WHERE z.active
   AND (z.valid_from IS NULL OR z.valid_from <= now())
   AND (z.valid_to   IS NULL OR z.valid_to   >  now())
 ORDER BY z.country_code, z.layer_id, COALESCE(z.dedupe_key, z.id::text),
          z.authority_rank NULLS LAST, z.updated_at DESC;

-- 3. Rewrite airspace_zones_intersecting_route: filter FIRST, then dedupe
CREATE OR REPLACE FUNCTION public.airspace_zones_intersecting_route(
  p_route jsonb,
  p_buffer_m integer,
  p_zone_types text[] DEFAULT NULL::text[],
  p_country_codes text[] DEFAULT NULL::text[],
  p_layer_ids text[] DEFAULT NULL::text[]
)
RETURNS TABLE(id uuid, country_code text, source text, layer_id text, zone_type text, restriction_type text, display_class text, theme text, name text, short_name text, lower_limit_m integer, upper_limit_m integer, altitude_reference text, authority_rank smallint, dedupe_key text, distance_m double precision, route_inside boolean, properties jsonb)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_route geometry;
  v_buffer int;
BEGIN
  v_buffer := LEAST(GREATEST(COALESCE(p_buffer_m, 0), 0), 100000);
  v_route  := ST_SetSRID(ST_GeomFromGeoJSON(p_route::text), 4326);

  RETURN QUERY
  WITH candidates AS (
    SELECT z.id, z.country_code, z.source, z.layer_id, z.zone_type, z.restriction_type,
           z.display_class, z.theme, z.name, z.short_name,
           z.lower_limit_m, z.upper_limit_m, z.altitude_reference,
           z.authority_rank, z.dedupe_key, z.properties, z.geom, z.updated_at
      FROM public.airspace_zones z
     WHERE z.active
       AND (z.valid_from IS NULL OR z.valid_from <= now())
       AND (z.valid_to   IS NULL OR z.valid_to   >  now())
       AND (p_country_codes IS NULL OR z.country_code = ANY(p_country_codes))
       AND (p_layer_ids     IS NULL OR z.layer_id     = ANY(p_layer_ids))
       AND (p_zone_types    IS NULL OR z.zone_type    = ANY(p_zone_types))
       AND ST_DWithin(z.geom::geography, v_route::geography, v_buffer)
  ), deduped AS (
    SELECT DISTINCT ON (country_code, layer_id, COALESCE(dedupe_key, id::text))
           id, country_code, source, layer_id, zone_type, restriction_type,
           display_class, theme, name, short_name,
           lower_limit_m, upper_limit_m, altitude_reference,
           authority_rank, dedupe_key, properties, geom
      FROM candidates
     ORDER BY country_code, layer_id, COALESCE(dedupe_key, id::text),
              authority_rank NULLS LAST, updated_at DESC
  )
  SELECT d.id, d.country_code, d.source, d.layer_id, d.zone_type, d.restriction_type,
         d.display_class, d.theme, d.name, d.short_name,
         d.lower_limit_m, d.upper_limit_m, d.altitude_reference,
         d.authority_rank, d.dedupe_key,
         ST_Distance(d.geom::geography, v_route::geography) AS distance_m,
         ST_Intersects(d.geom, v_route)                     AS route_inside,
         d.properties
    FROM deduped d;
END;
$function$;

-- 4. Rewrite airspace_zones_in_bbox: same pattern, envelope filter
CREATE OR REPLACE FUNCTION public.airspace_zones_in_bbox(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_zone_types text[] DEFAULT NULL::text[],
  p_country_codes text[] DEFAULT NULL::text[],
  p_layer_ids text[] DEFAULT NULL::text[]
)
RETURNS TABLE(id uuid, country_code text, source text, layer_id text, zone_type text, restriction_type text, display_class text, theme text, name text, short_name text, lower_limit_m integer, upper_limit_m integer, altitude_reference text, authority_rank smallint, dedupe_key text, geometry_geojson jsonb, properties jsonb)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH candidates AS (
    SELECT z.id, z.country_code, z.source, z.layer_id, z.zone_type, z.restriction_type,
           z.display_class, z.theme, z.name, z.short_name,
           z.lower_limit_m, z.upper_limit_m, z.altitude_reference,
           z.authority_rank, z.dedupe_key, z.properties, z.geom, z.updated_at
      FROM public.airspace_zones z
     WHERE z.active
       AND (z.valid_from IS NULL OR z.valid_from <= now())
       AND (z.valid_to   IS NULL OR z.valid_to   >  now())
       AND (p_country_codes IS NULL OR z.country_code = ANY(p_country_codes))
       AND (p_layer_ids     IS NULL OR z.layer_id     = ANY(p_layer_ids))
       AND (p_zone_types    IS NULL OR z.zone_type    = ANY(p_zone_types))
       AND ST_Intersects(
             z.geom,
             ST_MakeEnvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)
           )
  ), deduped AS (
    SELECT DISTINCT ON (country_code, layer_id, COALESCE(dedupe_key, id::text))
           id, country_code, source, layer_id, zone_type, restriction_type,
           display_class, theme, name, short_name,
           lower_limit_m, upper_limit_m, altitude_reference,
           authority_rank, dedupe_key, properties, geom
      FROM candidates
     ORDER BY country_code, layer_id, COALESCE(dedupe_key, id::text),
              authority_rank NULLS LAST, updated_at DESC
  )
  SELECT d.id, d.country_code, d.source, d.layer_id, d.zone_type, d.restriction_type,
         d.display_class, d.theme, d.name, d.short_name,
         d.lower_limit_m, d.upper_limit_m, d.altitude_reference,
         d.authority_rank, d.dedupe_key,
         ST_AsGeoJSON(d.geom)::jsonb AS geometry_geojson,
         d.properties
    FROM deduped d;
$function$;
