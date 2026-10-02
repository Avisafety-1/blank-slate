CREATE OR REPLACE FUNCTION public.upsert_caa_nature_batch(p_layer_id text, p_features jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f jsonb; n integer := 0; errors integer := 0; g geometry;
BEGIN
  IF p_layer_id NOT IN ('verneomrader_forbud', 'verneomrader_obs') OR jsonb_typeof(p_features) IS DISTINCT FROM 'array' OR jsonb_array_length(p_features) > 30 THEN
    RAISE EXCEPTION 'Invalid nature batch';
  END IF;
  FOR f IN SELECT value FROM jsonb_array_elements(p_features) LOOP
    BEGIN
      IF nullif(f->>'external_id', '') IS NULL OR nullif(f->>'geometry_geojson', '') IS NULL THEN RAISE EXCEPTION 'Missing ID or geometry'; END IF;
      g := ST_SetSRID(ST_GeomFromGeoJSON(f->>'geometry_geojson'), 4326);
      IF NOT ST_IsValid(g) THEN g := ST_MakeValid(g); END IF;
      INSERT INTO public.caa_drone_zones (layer_id, external_id, name, restriction, reason, message, authority_name, authority_url, authority_phone, lower_limit_m, upper_limit_m, lower_ref, upper_ref, geometry, properties, last_synced_at, updated_at)
      VALUES (p_layer_id, f->>'external_id', f->>'name', f->>'restriction', ARRAY(SELECT jsonb_array_elements_text(f->'reason')), f->>'message', f->>'authority_name', f->>'authority_url', f->>'authority_phone', NULLIF(f->>'lower_limit_m','')::double precision, NULLIF(f->>'upper_limit_m','')::double precision, f->>'lower_ref', f->>'upper_ref', g, COALESCE(f->'properties','{}'::jsonb), now(), now())
      ON CONFLICT (layer_id, external_id) DO UPDATE SET name = EXCLUDED.name, restriction = EXCLUDED.restriction, reason = EXCLUDED.reason, message = EXCLUDED.message, authority_name = EXCLUDED.authority_name, authority_url = EXCLUDED.authority_url, authority_phone = EXCLUDED.authority_phone, lower_limit_m = EXCLUDED.lower_limit_m, upper_limit_m = EXCLUDED.upper_limit_m, lower_ref = EXCLUDED.lower_ref, upper_ref = EXCLUDED.upper_ref, geometry = EXCLUDED.geometry, properties = EXCLUDED.properties, last_synced_at = now(), updated_at = now();
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN errors := errors + 1;
    END;
  END LOOP;
  RETURN jsonb_build_object('success', n, 'error', errors);
END $$;
REVOKE EXECUTE ON FUNCTION public.upsert_caa_nature_batch(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_caa_nature_batch(text, jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.prune_caa_nature_zones(p_layer_id text, p_external_ids text[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF p_layer_id NOT IN ('verneomrader_forbud', 'verneomrader_obs') OR p_external_ids IS NULL OR cardinality(p_external_ids) = 0 THEN RAISE EXCEPTION 'Invalid nature prune'; END IF;
  DELETE FROM public.caa_drone_zones WHERE layer_id = p_layer_id AND external_id <> ALL(p_external_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.prune_caa_nature_zones(text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_caa_nature_zones(text, text[]) TO service_role;