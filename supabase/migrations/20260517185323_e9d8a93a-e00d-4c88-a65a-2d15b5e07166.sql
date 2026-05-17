
-- 1. New table for CAA (Luftfartstilsynet) drone zones from dronesoner.no
CREATE TABLE public.caa_drone_zones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  layer_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  name TEXT,
  restriction TEXT,
  reason TEXT[],
  message TEXT,
  authority_name TEXT,
  authority_url TEXT,
  authority_phone TEXT,
  lower_limit_m DOUBLE PRECISION,
  upper_limit_m DOUBLE PRECISION,
  lower_ref TEXT,
  upper_ref TEXT,
  geometry GEOMETRY(Geometry, 4326),
  properties JSONB DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (layer_id, external_id)
);

CREATE INDEX caa_drone_zones_geom_gix ON public.caa_drone_zones USING GIST (geometry);
CREATE INDEX caa_drone_zones_layer_idx ON public.caa_drone_zones (layer_id);

ALTER TABLE public.caa_drone_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read CAA drone zones"
ON public.caa_drone_zones FOR SELECT
TO authenticated
USING (true);

-- 2. Bulk upsert RPC (called by sync edge function via service role)
CREATE OR REPLACE FUNCTION public.bulk_upsert_caa_zones(
  p_layer_id TEXT,
  p_features JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_feature JSONB;
  v_geom GEOMETRY;
  v_success INT := 0;
  v_error INT := 0;
  v_skipped INT := 0;
  v_deleted INT := 0;
  v_external_ids TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF p_layer_id IS NULL OR p_features IS NULL THEN
    RAISE EXCEPTION 'layer_id and features required';
  END IF;

  FOR v_feature IN SELECT * FROM jsonb_array_elements(p_features)
  LOOP
    BEGIN
      IF v_feature->>'external_id' IS NULL OR v_feature->>'geometry_geojson' IS NULL THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      v_geom := ST_SetSRID(ST_GeomFromGeoJSON(v_feature->>'geometry_geojson'), 4326);
      IF v_geom IS NULL OR NOT ST_IsValid(v_geom) THEN
        v_geom := ST_MakeValid(v_geom);
      END IF;

      INSERT INTO public.caa_drone_zones (
        layer_id, external_id, name, restriction, reason, message,
        authority_name, authority_url, authority_phone,
        lower_limit_m, upper_limit_m, lower_ref, upper_ref,
        geometry, properties, last_synced_at, updated_at
      ) VALUES (
        p_layer_id,
        v_feature->>'external_id',
        v_feature->>'name',
        v_feature->>'restriction',
        CASE WHEN v_feature->'reason' IS NOT NULL
             THEN ARRAY(SELECT jsonb_array_elements_text(v_feature->'reason'))
             ELSE NULL END,
        v_feature->>'message',
        v_feature->>'authority_name',
        v_feature->>'authority_url',
        v_feature->>'authority_phone',
        NULLIF(v_feature->>'lower_limit_m','')::DOUBLE PRECISION,
        NULLIF(v_feature->>'upper_limit_m','')::DOUBLE PRECISION,
        v_feature->>'lower_ref',
        v_feature->>'upper_ref',
        v_geom,
        COALESCE(v_feature->'properties', '{}'::jsonb),
        now(), now()
      )
      ON CONFLICT (layer_id, external_id) DO UPDATE SET
        name = EXCLUDED.name,
        restriction = EXCLUDED.restriction,
        reason = EXCLUDED.reason,
        message = EXCLUDED.message,
        authority_name = EXCLUDED.authority_name,
        authority_url = EXCLUDED.authority_url,
        authority_phone = EXCLUDED.authority_phone,
        lower_limit_m = EXCLUDED.lower_limit_m,
        upper_limit_m = EXCLUDED.upper_limit_m,
        lower_ref = EXCLUDED.lower_ref,
        upper_ref = EXCLUDED.upper_ref,
        geometry = EXCLUDED.geometry,
        properties = EXCLUDED.properties,
        last_synced_at = now(),
        updated_at = now();

      v_external_ids := array_append(v_external_ids, v_feature->>'external_id');
      v_success := v_success + 1;
    EXCEPTION WHEN OTHERS THEN
      v_error := v_error + 1;
    END;
  END LOOP;

  -- Delete zones in this layer that weren't in the batch (stale)
  IF array_length(v_external_ids, 1) > 0 THEN
    DELETE FROM public.caa_drone_zones
    WHERE layer_id = p_layer_id
      AND external_id <> ALL(v_external_ids);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', v_success,
    'error', v_error,
    'skipped', v_skipped,
    'deleted', v_deleted
  );
END;
$$;

-- 3. Viewport fetch RPC for map rendering
CREATE OR REPLACE FUNCTION public.get_caa_zones_in_bounds(
  min_lat DOUBLE PRECISION,
  min_lng DOUBLE PRECISION,
  max_lat DOUBLE PRECISION,
  max_lng DOUBLE PRECISION,
  p_layer_ids TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  layer_id TEXT,
  external_id TEXT,
  name TEXT,
  restriction TEXT,
  reason TEXT[],
  message TEXT,
  authority_name TEXT,
  authority_url TEXT,
  authority_phone TEXT,
  lower_limit_m DOUBLE PRECISION,
  upper_limit_m DOUBLE PRECISION,
  lower_ref TEXT,
  upper_ref TEXT,
  geometry JSONB,
  properties JSONB
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    z.id, z.layer_id, z.external_id, z.name, z.restriction, z.reason, z.message,
    z.authority_name, z.authority_url, z.authority_phone,
    z.lower_limit_m, z.upper_limit_m, z.lower_ref, z.upper_ref,
    ST_AsGeoJSON(z.geometry)::jsonb AS geometry,
    z.properties
  FROM public.caa_drone_zones z
  WHERE (p_layer_ids IS NULL OR z.layer_id = ANY(p_layer_ids))
    AND ST_Intersects(
      z.geometry,
      ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
    )
  LIMIT 1000;
$$;

-- 4. Extend check_mission_airspace to include CAA zones
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
    -- New: CAA drone zones from dronesoner.no
    SELECT cz.id::text,
           'CAA_' || UPPER(cz.layer_id),
           COALESCE(cz.name, 'Ukjent'),
           cz.geometry
    FROM caa_drone_zones cz
    WHERE cz.geometry IS NOT NULL
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
      WHEN rc.cz_type IN ('D', 'RMZ', 'TMZ', 'ATZ', '5KM') THEN 'CAUTION'
      WHEN rc.cz_type IN ('CTR', 'TIZ', 'CTR/TIZ') THEN 'CAUTION'
      WHEN rc.cz_type IN ('FERDSELSFORBUD', 'LANDINGSFORBUD') THEN 'WARNING'
      WHEN rc.cz_type = 'LAVFLYVING' THEN 'CAUTION'
      WHEN rc.cz_type = 'NATURVERN' THEN 'INFO'
      WHEN rc.cz_type = 'NOTAM' THEN 'CAUTION'
      -- New CAA layers
      WHEN rc.cz_type IN ('CAA_FENGSLER', 'CAA_AMBASSADER') THEN 'WARNING'
      WHEN rc.cz_type IN ('CAA_FAREOMRADER', 'CAA_FLYPLASSER', 'CAA_NOTAM_SONER') THEN 'CAUTION'
      ELSE 'INFO'
    END
  FROM route_check rc
  WHERE rc.ri = true OR rc.md < 5000
  LIMIT 200;
END;
$function$;
