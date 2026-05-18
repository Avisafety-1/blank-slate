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
  v_feature jsonb;
BEGIN
  IF p_layer_id IS NULL OR p_features IS NULL THEN
    RETURN jsonb_build_object('success', 0, 'error', 0, 'deleted', 0);
  END IF;

  SELECT COALESCE(array_agg(DISTINCT (elem->>'external_id')), ARRAY[]::text[])
  INTO v_external_ids
  FROM jsonb_array_elements(p_features) AS elem
  WHERE elem->>'external_id' IS NOT NULL;

  FOR v_feature IN SELECT * FROM jsonb_array_elements(p_features) LOOP
    BEGIN
      INSERT INTO public.dk_drone_zones (
        layer_id, geometry_type, external_id, name, category, buffer, icao,
        elevation_m, lower_limit_m, upper_limit_m, geometry, properties, last_synced_at
      ) VALUES (
        p_layer_id,
        v_feature->>'geometry_type',
        v_feature->>'external_id',
        v_feature->>'name',
        v_feature->>'category',
        v_feature->>'buffer',
        v_feature->>'icao',
        NULLIF(v_feature->>'elevation_m','')::double precision,
        NULLIF(v_feature->>'lower_limit_m','')::double precision,
        NULLIF(v_feature->>'upper_limit_m','')::double precision,
        ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(v_feature->>'geometry_geojson'), 4326)),
        COALESCE(v_feature->'properties', '{}'::jsonb),
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
  v_feature jsonb;
BEGIN
  IF p_features IS NULL THEN
    RETURN jsonb_build_object('success', 0, 'error', 0, 'deleted', 0);
  END IF;

  SELECT COALESCE(array_agg(DISTINCT (elem->>'external_id')), ARRAY[]::text[])
  INTO v_external_ids
  FROM jsonb_array_elements(p_features) AS elem
  WHERE elem->>'external_id' IS NOT NULL;

  FOR v_feature IN SELECT * FROM jsonb_array_elements(p_features) LOOP
    BEGIN
      INSERT INTO public.dk_nature_areas (
        external_id, theme, name, restriction_period, reason, active, source_url,
        geometry, properties, last_synced_at
      ) VALUES (
        v_feature->>'external_id',
        v_feature->>'theme',
        v_feature->>'name',
        v_feature->>'restriction_period',
        v_feature->>'reason',
        COALESCE((v_feature->>'active')::boolean, true),
        v_feature->>'source_url',
        ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(v_feature->>'geometry_geojson'), 4326)),
        COALESCE(v_feature->'properties', '{}'::jsonb),
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

REVOKE EXECUTE ON FUNCTION public.bulk_upsert_dk_drone_zones(text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bulk_upsert_dk_nature_areas(jsonb) FROM PUBLIC;

DO $$
DECLARE v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret' LIMIT 1;
  PERFORM net.http_post(
    url := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/sync-dk-drone-zones',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXJhYmFzZSIsInJlZiI6InBtdWNzdnJ5cG9ndHR0cmFqcXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjcyMDEsImV4cCI6MjA3OTgwMzIwMX0.DMr5OjalAbZKedx0zqcTBWe5eMTrjlXIw384ycvX8dE',
      'x-cron-secret', v_secret
    ),
    body := jsonb_build_object('trigger', 'manual-initial-force2d', 'time', now())
  );
END $$;