CREATE OR REPLACE FUNCTION public.check_mission_airspace_unified(
  p_lat double precision,
  p_lng double precision,
  p_route jsonb DEFAULT NULL::jsonb
)
RETURNS TABLE(z_id text, z_type text, z_name text, min_distance double precision, route_inside boolean, severity text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '8s'
AS $function$
DECLARE
  v_point geometry;
  v_envelope geometry;
  v_route_line geometry;
BEGIN
  v_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);

  IF p_route IS NOT NULL AND jsonb_array_length(p_route) > 0 THEN
    WITH route_points AS (
      SELECT ST_SetSRID(ST_MakePoint(
        (elem->>'lng')::double precision,
        (elem->>'lat')::double precision
      ), 4326) AS geom
      FROM jsonb_array_elements(p_route) AS elem
    )
    SELECT ST_ConvexHull(ST_Collect(geom)) INTO v_envelope FROM route_points;

    IF jsonb_array_length(p_route) >= 2 THEN
      WITH ordered_points AS (
        SELECT ST_SetSRID(ST_MakePoint(
          (elem->>'lng')::double precision,
          (elem->>'lat')::double precision
        ), 4326) AS geom
        FROM jsonb_array_elements(p_route) WITH ORDINALITY AS t(elem, ord)
        ORDER BY ord
      )
      SELECT ST_MakeLine(array_agg(geom)) INTO v_route_line FROM ordered_points;
    ELSE
      v_route_line := NULL;
    END IF;
  ELSE
    v_envelope := v_point;
    v_route_line := NULL;
  END IF;

  RETURN QUERY
  WITH candidate_zones AS (
    -- Unified airspace (DK/SE/DE/FI) — CTR/TIZ/CTA/RMZ/TMZ/ATZ/R/D/P/NATURE etc.
    SELECT
      az.id::text AS zid,
      COALESCE(NULLIF(UPPER(az.zone_type), ''), UPPER(COALESCE(az.display_class, 'AIRSPACE'))) AS t,
      COALESCE(az.name, az.short_name, 'Ukjent sone') AS nm,
      az.geom AS g,
      50000::double precision AS search_radius
    FROM public.airspace_zones az
    WHERE az.country_code IN ('DK','SE','DE','FI')
      AND az.active = true
      AND az.geom IS NOT NULL
      AND ST_DWithin(az.geom::geography, v_envelope::geography, 50000)

    UNION ALL
    -- Danske dronesoner (rod = 5 km ring, orange = restriksjon, bla = info)
    SELECT
      dz.id::text,
      CASE dz.layer_id
        WHEN 'rod' THEN '5KM'
        WHEN 'orange' THEN 'RESTRICTED'
        WHEN 'bla' THEN 'INFO'
        ELSE UPPER(COALESCE(dz.layer_id, 'DK_ZONE'))
      END,
      COALESCE(dz.name, 'Ukjent DK-sone'),
      dz.geometry,
      50000::double precision
    FROM public.dk_drone_zones dz
    WHERE dz.layer_id IN ('rod','orange','bla')
      AND dz.geometry IS NOT NULL
      AND ST_DWithin(dz.geometry::geography, v_envelope::geography, 50000)

    UNION ALL
    -- Danske naturområder (Natura2000 osv.)
    SELECT
      dn.id::text,
      'NATURVERN',
      COALESCE(dn.name, dn.theme, 'Ukjent naturområde'),
      dn.geometry,
      2000::double precision
    FROM public.dk_nature_areas dn
    WHERE dn.active = true
      AND dn.geometry IS NOT NULL
      AND ST_DWithin(dn.geometry::geography, v_envelope::geography, 2000)
  ),
  scored AS (
    SELECT
      cz.zid,
      cz.t,
      cz.nm,
      cz.g,
      cz.search_radius,
      ST_Distance(cz.g::geography, v_envelope::geography) AS dist,
      CASE
        WHEN ST_Intersects(cz.g, v_envelope) THEN true
        WHEN v_route_line IS NOT NULL AND ST_Intersects(cz.g, v_route_line) THEN true
        ELSE false
      END AS inside
    FROM candidate_zones cz
  )
  SELECT
    s.zid,
    s.t,
    s.nm,
    s.dist,
    s.inside,
    CASE
      WHEN s.inside THEN 'high'
      WHEN s.dist <= 1000 THEN 'medium'
      ELSE 'low'
    END::text AS severity
  FROM scored s
  WHERE s.inside = true OR s.dist <= s.search_radius
  ORDER BY s.inside DESC, s.dist ASC
  LIMIT 200;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.check_mission_airspace_unified(double precision, double precision, jsonb) TO authenticated, service_role;