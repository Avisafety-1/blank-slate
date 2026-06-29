CREATE OR REPLACE FUNCTION public.check_mission_airspace(
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
    SELECT n.id::text, 'NSM' AS t, COALESCE(n.properties->>'navn', n.name, 'Ukjent') AS nm, n.geometry AS g
    FROM nsm_restriction_zones n
    WHERE n.geometry IS NOT NULL
      AND ST_DWithin(n.geometry::geography, v_envelope::geography, 50000)

    UNION ALL
    SELECT a.id::text, '5KM', COALESCE(a.properties->>'NAVN', a.name, 'Ukjent'), a.geometry
    FROM rpas_5km_zones a
    WHERE a.geometry IS NOT NULL
      AND ST_DWithin(a.geometry::geography, v_envelope::geography, 50000)

    UNION ALL
    SELECT ct.id::text, COALESCE(ct.properties->>'Zone', 'CTR/TIZ'), COALESCE(ct.name, 'Ukjent'), ct.geometry
    FROM rpas_ctr_tiz ct
    WHERE ct.geometry IS NOT NULL
      AND ST_DWithin(ct.geometry::geography, v_envelope::geography, 50000)

    UNION ALL
    -- Kun offisielle ATZ (ekte småflyplasser). Seil-/modellfly-klubb-ATZ er markert is_official=false
    -- og skal IKKE behandles som 5 km PPR-sone.
    SELECT az.id::text, 'ATZ_5KM',
           COALESCE(az.name, az.zone_id, 'Ukjent småflyplass'),
           ST_Buffer(ST_Centroid(az.geometry)::geography, 5000)::geometry
    FROM aip_restriction_zones az
    WHERE az.zone_type = 'ATZ'
      AND az.is_official = true
      AND az.geometry IS NOT NULL
      AND ST_DWithin(ST_Centroid(az.geometry)::geography, v_envelope::geography, 50000)

    UNION ALL
    -- Småflyplasser (faste fly) fra dronesoner.no: 5 km PPR-sirkel.
    -- Helikopterplasser ekskluderes — de holdes som ordinære CAA_FLYPLASSER-punkter.
    SELECT cz.id::text, 'ATZ_5KM',
           COALESCE(cz.name, 'Småflyplass'),
           ST_Buffer(ST_Centroid(cz.geometry)::geography, 5000)::geometry
    FROM caa_drone_zones cz
    WHERE cz.layer_id = 'flyplasser'
      AND COALESCE(cz.properties->>'type', '') = 'Fly'
      AND cz.geometry IS NOT NULL
      AND ST_DWithin(ST_Centroid(cz.geometry)::geography, v_envelope::geography, 50000)

    UNION ALL
    SELECT nv.id::text, 'NATURVERN', COALESCE(nv.name, 'Ukjent'), nv.geometry
    FROM naturvern_zones nv
    WHERE nv.geometry IS NOT NULL
      AND ST_DWithin(nv.geometry::geography, v_envelope::geography, 2000)

    UNION ALL
    SELECT vr.id::text, UPPER(COALESCE(vr.restriction_type, 'VERN_RESTRIKSJON')),
           COALESCE(vr.name, 'Ukjent'), vr.geometry
    FROM vern_restriction_zones vr
    WHERE vr.geometry IS NOT NULL
      AND ST_DWithin(vr.geometry::geography, v_envelope::geography, 2000)

    UNION ALL
    SELECT nt.notam_id::text, 'NOTAM',
           nt.notam_id || ': ' || LEFT(
             regexp_replace(
               regexp_replace(
                 regexp_replace(COALESCE(nt.notam_text, ''), '^[A-Z]{4}/Q[^\n]+\n*', '', 'g'),
                 '<[^>]+>', ' ', 'g'),
               '\s+', ' ', 'g'),
             120),
           nt.geometry
    FROM notams nt
    WHERE nt.geometry IS NOT NULL
      AND (nt.effective_end IS NULL OR nt.effective_end > NOW()
           OR nt.effective_end_interpretation IN ('PERM', 'EST'))
      AND ST_DWithin(nt.geometry::geography, v_envelope::geography, 50000)

    UNION ALL
    -- Andre CAA-soner: helikopterplasser inkluderes her som CAA_FLYPLASSER (uten 5 km-buffer).
    SELECT cz.id::text,
           'CAA_' || UPPER(cz.layer_id),
           COALESCE(cz.name, 'Ukjent'),
           cz.geometry
    FROM caa_drone_zones cz
    WHERE cz.geometry IS NOT NULL
      AND NOT (cz.layer_id = 'flyplasser' AND COALESCE(cz.properties->>'type', '') = 'Fly')
      AND ST_DWithin(cz.geometry::geography, v_envelope::geography, 5000)
  ),
  route_check AS (
    SELECT
      cz.cz_id, cz.cz_type, cz.cz_name, cz.cz_geom,
      CASE
        WHEN v_route_line IS NOT NULL THEN ST_Intersects(v_route_line, cz.cz_geom)
        WHEN p_route IS NOT NULL AND jsonb_array_length(p_route) > 0 THEN
          ST_Within(ST_SetSRID(ST_MakePoint(
            (p_route->0->>'lng')::double precision,
            (p_route->0->>'lat')::double precision
          ), 4326), cz.cz_geom)
        ELSE ST_Within(v_point, cz.cz_geom)
      END AS ri,
      CASE
        WHEN v_route_line IS NOT NULL THEN ST_Distance(v_route_line::geography, cz.cz_geom::geography)
        WHEN p_route IS NOT NULL AND jsonb_array_length(p_route) > 0 THEN
          (SELECT MIN(ST_Distance(
            ST_SetSRID(ST_MakePoint(
              (elem->>'lng')::double precision,
              (elem->>'lat')::double precision
            ), 4326)::geography, cz.cz_geom::geography))
           FROM jsonb_array_elements(p_route) AS elem)
        ELSE ST_Distance(v_point::geography, cz.cz_geom::geography)
      END AS md
    FROM candidate_zones cz(cz_id, cz_type, cz_name, cz_geom)
  )
  SELECT
    rc.cz_id, rc.cz_type, rc.cz_name, rc.md, rc.ri,
    CASE
      WHEN rc.cz_type IN ('NSM') THEN 'WARNING'
      WHEN rc.cz_type IN ('D', 'RMZ', 'TMZ', 'ATZ', '5KM', 'ATZ_5KM') THEN 'CAUTION'
      WHEN rc.cz_type IN ('CTR', 'TIZ', 'CTR/TIZ') THEN 'CAUTION'
      WHEN rc.cz_type IN ('FERDSELSFORBUD', 'LANDINGSFORBUD') THEN 'WARNING'
      WHEN rc.cz_type = 'LAVFLYVING' THEN 'CAUTION'
      WHEN rc.cz_type = 'NATURVERN' THEN 'INFO'
      WHEN rc.cz_type = 'NOTAM' THEN 'CAUTION'
      WHEN rc.cz_type IN ('CAA_FENGSLER', 'CAA_AMBASSADER') THEN 'WARNING'
      WHEN rc.cz_type IN ('CAA_FAREOMRADER', 'CAA_FLYPLASSER', 'CAA_NOTAM_SONER') THEN 'CAUTION'
      ELSE 'INFO'
    END
  FROM route_check rc
  WHERE rc.ri = true OR rc.md < 5000
  LIMIT 200;
END;
$function$;