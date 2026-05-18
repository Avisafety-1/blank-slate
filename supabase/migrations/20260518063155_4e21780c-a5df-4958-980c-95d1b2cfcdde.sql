
CREATE OR REPLACE FUNCTION public.bulk_upsert_dk_drone_zones(
  p_layer_id text,
  p_features jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_success int := 0;
  v_error int := 0;
  v_deleted int := 0;
  v_external_ids text[];
  f jsonb;
BEGIN
  IF p_layer_id IS NULL OR p_features IS NULL THEN
    RETURN jsonb_build_object('success', 0, 'error', 0, 'deleted', 0);
  END IF;

  SELECT COALESCE(array_agg(DISTINCT (f->>'external_id')), ARRAY[]::text[])
  INTO v_external_ids
  FROM jsonb_array_elements(p_features) AS f
  WHERE f->>'external_id' IS NOT NULL;

  FOR f IN SELECT * FROM jsonb_array_elements(p_features) LOOP
    BEGIN
      INSERT INTO public.dk_drone_zones (
        layer_id, geometry_type, external_id, name, category, buffer, icao,
        elevation_m, lower_limit_m, upper_limit_m, geometry, properties, last_synced_at
      ) VALUES (
        p_layer_id,
        f->>'geometry_type',
        f->>'external_id',
        f->>'name',
        f->>'category',
        f->>'buffer',
        f->>'icao',
        NULLIF(f->>'elevation_m','')::double precision,
        NULLIF(f->>'lower_limit_m','')::double precision,
        NULLIF(f->>'upper_limit_m','')::double precision,
        ST_SetSRID(ST_GeomFromGeoJSON(f->>'geometry_geojson'), 4326),
        COALESCE(f->'properties', '{}'::jsonb),
        now()
      )
      ON CONFLICT (layer_id, geometry_type, external_id) DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        buffer = EXCLUDED.buffer,
        icao = EXCLUDED.icao,
        elevation_m = EXCLUDED.elevation_m,
        lower_limit_m = EXCLUDED.lower_limit_m,
        upper_limit_m = EXCLUDED.upper_limit_m,
        geometry = EXCLUDED.geometry,
        properties = EXCLUDED.properties,
        last_synced_at = now(),
        updated_at = now();
      v_success := v_success + 1;
    EXCEPTION WHEN OTHERS THEN
      v_error := v_error + 1;
    END;
  END LOOP;

  DELETE FROM public.dk_drone_zones
  WHERE layer_id = p_layer_id
    AND external_id <> ALL(v_external_ids);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('success', v_success, 'error', v_error, 'deleted', v_deleted);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bulk_upsert_dk_drone_zones(text, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.bulk_upsert_dk_nature_areas(
  p_features jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_success int := 0;
  v_error int := 0;
  v_deleted int := 0;
  v_external_ids text[];
  f jsonb;
BEGIN
  IF p_features IS NULL THEN
    RETURN jsonb_build_object('success', 0, 'error', 0, 'deleted', 0);
  END IF;

  SELECT COALESCE(array_agg(DISTINCT (f->>'external_id')), ARRAY[]::text[])
  INTO v_external_ids
  FROM jsonb_array_elements(p_features) AS f
  WHERE f->>'external_id' IS NOT NULL;

  FOR f IN SELECT * FROM jsonb_array_elements(p_features) LOOP
    BEGIN
      INSERT INTO public.dk_nature_areas (
        external_id, theme, name, restriction_period, reason, active, source_url,
        geometry, properties, last_synced_at
      ) VALUES (
        f->>'external_id',
        f->>'theme',
        f->>'name',
        f->>'restriction_period',
        f->>'reason',
        COALESCE((f->>'active')::boolean, true),
        f->>'source_url',
        ST_SetSRID(ST_GeomFromGeoJSON(f->>'geometry_geojson'), 4326),
        COALESCE(f->'properties', '{}'::jsonb),
        now()
      )
      ON CONFLICT (external_id) DO UPDATE SET
        theme = EXCLUDED.theme,
        name = EXCLUDED.name,
        restriction_period = EXCLUDED.restriction_period,
        reason = EXCLUDED.reason,
        active = EXCLUDED.active,
        source_url = EXCLUDED.source_url,
        geometry = EXCLUDED.geometry,
        properties = EXCLUDED.properties,
        last_synced_at = now(),
        updated_at = now();
      v_success := v_success + 1;
    EXCEPTION WHEN OTHERS THEN
      v_error := v_error + 1;
    END;
  END LOOP;

  DELETE FROM public.dk_nature_areas
  WHERE external_id <> ALL(v_external_ids);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('success', v_success, 'error', v_error, 'deleted', v_deleted);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bulk_upsert_dk_nature_areas(jsonb) FROM PUBLIC;
