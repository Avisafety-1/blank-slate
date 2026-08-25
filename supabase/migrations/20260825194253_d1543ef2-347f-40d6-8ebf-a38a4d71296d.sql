CREATE OR REPLACE FUNCTION public.airspace_zones_in_bbox(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_zone_types text[] DEFAULT NULL::text[],
  p_country_codes text[] DEFAULT NULL::text[],
  p_layer_ids text[] DEFAULT NULL::text[],
  p_zoom integer DEFAULT NULL::integer
)
RETURNS TABLE(id uuid, country_code text, source text, layer_id text, zone_type text, restriction_type text, display_class text, theme text, name text, short_name text, lower_limit_m integer, upper_limit_m integer, altitude_reference text, authority_rank smallint, dedupe_key text, geometry_geojson jsonb, properties jsonb)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH params AS (
    SELECT
      CASE
        WHEN p_zoom IS NULL THEN 0::double precision
        WHEN p_zoom >= 14 THEN 0::double precision
        WHEN p_zoom <= 7 THEN 611::double precision
        ELSE (156543.03392 / power(2, p_zoom) / 2)::double precision
      END AS tol_m,
      CASE
        WHEN p_zoom IS NULL THEN 9
        WHEN p_zoom >= 14 THEN 7
        WHEN p_zoom >= 12 THEN 6
        WHEN p_zoom >= 9  THEN 5
        ELSE 4
      END AS decs
  ), candidates AS (
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
         CASE
           WHEN pa.tol_m = 0 OR ST_NPoints(d.geom) <= 100
             THEN ST_AsGeoJSON(d.geom, pa.decs)::jsonb
           ELSE COALESCE(
             ST_AsGeoJSON(
               ST_Transform(
                 ST_SimplifyPreserveTopology(ST_Transform(d.geom, 3857), pa.tol_m),
                 4326
               ),
               pa.decs
             )::jsonb,
             ST_AsGeoJSON(d.geom, pa.decs)::jsonb
           )
         END AS geometry_geojson,
         d.properties
    FROM deduped d CROSS JOIN params pa;
$function$;