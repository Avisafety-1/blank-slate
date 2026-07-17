
CREATE OR REPLACE FUNCTION public.bulk_upsert_airspace_zones(
  p_features jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_feature jsonb;
  v_geom geometry;
  v_upserted integer := 0;
  v_skipped integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_len integer;
BEGIN
  IF jsonb_typeof(p_features) <> 'array' THEN
    RAISE EXCEPTION 'p_features must be a JSON array';
  END IF;

  v_len := jsonb_array_length(p_features);
  IF v_len > 1000 THEN
    RAISE EXCEPTION 'bulk_upsert_airspace_zones: batch too large (% > 1000)', v_len;
  END IF;

  FOR v_feature IN SELECT * FROM jsonb_array_elements(p_features)
  LOOP
    BEGIN
      v_geom := ST_SetSRID(
        ST_GeomFromGeoJSON((v_feature->>'geometry_geojson')),
        4326
      );
      IF v_geom IS NULL OR ST_IsEmpty(v_geom) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;
      IF ST_GeometryType(v_geom) NOT IN (
        'ST_Point','ST_MultiPoint',
        'ST_LineString','ST_MultiLineString',
        'ST_Polygon','ST_MultiPolygon'
      ) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.airspace_zones (
        country_code, source, external_id,
        zone_type, restriction_type, display_class, theme,
        name, short_name, authority,
        lower_limit_m, upper_limit_m,
        lower_limit_raw, upper_limit_raw, altitude_reference,
        valid_from, valid_to, active,
        properties, geom
      ) VALUES (
        v_feature->>'country_code',
        v_feature->>'source',
        v_feature->>'external_id',
        v_feature->>'zone_type',
        v_feature->>'restriction_type',
        v_feature->>'display_class',
        NULLIF(v_feature->>'theme',''),
        v_feature->>'name',
        NULLIF(v_feature->>'short_name',''),
        NULLIF(v_feature->>'authority',''),
        NULLIF(v_feature->>'lower_limit_m','')::integer,
        NULLIF(v_feature->>'upper_limit_m','')::integer,
        NULLIF(v_feature->>'lower_limit_raw',''),
        NULLIF(v_feature->>'upper_limit_raw',''),
        NULLIF(v_feature->>'altitude_reference',''),
        NULLIF(v_feature->>'valid_from','')::timestamptz,
        NULLIF(v_feature->>'valid_to','')::timestamptz,
        COALESCE((v_feature->>'active')::boolean, true),
        COALESCE(v_feature->'properties', '{}'::jsonb),
        v_geom
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
        valid_from = EXCLUDED.valid_from,
        valid_to = EXCLUDED.valid_to,
        active = EXCLUDED.active,
        properties = EXCLUDED.properties,
        geom = EXCLUDED.geom,
        updated_at = now();
      v_upserted := v_upserted + 1;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
      IF jsonb_array_length(v_errors) < 10 THEN
        v_errors := v_errors || jsonb_build_object(
          'external_id', v_feature->>'external_id',
          'error', SQLERRM
        );
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'upserted', v_upserted,
    'skipped', v_skipped,
    'errors', v_errors
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_upsert_airspace_zones(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_upsert_airspace_zones(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.deactivate_stale_airspace_zones(
  p_source text,
  p_country_code text,
  p_keep_external_ids text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_baseline integer;
  v_would_deactivate integer;
  v_deactivated integer;
BEGIN
  -- Guard: empty keep-list means the fetch returned nothing usable.
  -- Never mass-deactivate on that signal.
  IF p_keep_external_ids IS NULL OR array_length(p_keep_external_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'aborted', true,
      'reason', 'empty_keep_list',
      'deactivated', 0
    );
  END IF;

  SELECT count(*) INTO v_baseline
  FROM public.airspace_zones
  WHERE source = p_source
    AND country_code = p_country_code
    AND active = true;

  SELECT count(*) INTO v_would_deactivate
  FROM public.airspace_zones
  WHERE source = p_source
    AND country_code = p_country_code
    AND active = true
    AND NOT (external_id = ANY(p_keep_external_ids));

  IF v_baseline > 0 AND v_would_deactivate::numeric > (v_baseline::numeric * 0.5) THEN
    RETURN jsonb_build_object(
      'aborted', true,
      'reason', 'would_deactivate_more_than_50_percent',
      'baseline', v_baseline,
      'would_deactivate', v_would_deactivate,
      'deactivated', 0
    );
  END IF;

  UPDATE public.airspace_zones
  SET active = false, updated_at = now()
  WHERE source = p_source
    AND country_code = p_country_code
    AND active = true
    AND NOT (external_id = ANY(p_keep_external_ids));

  GET DIAGNOSTICS v_deactivated = ROW_COUNT;

  RETURN jsonb_build_object(
    'aborted', false,
    'baseline', v_baseline,
    'deactivated', v_deactivated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_stale_airspace_zones(text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_stale_airspace_zones(text, text, text[]) TO service_role;
