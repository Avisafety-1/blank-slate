
CREATE OR REPLACE FUNCTION public.bulk_upsert_airspace_zones(p_features jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_feature jsonb;
  v_upserted int := 0;
  v_skipped  int := 0;
  v_errors   jsonb := '[]'::jsonb;
  v_unmapped jsonb := '{}'::jsonb;
  v_layer    text;
  v_raw_type text;
  v_key      text;
BEGIN
  IF jsonb_typeof(p_features) <> 'array' THEN
    RETURN jsonb_build_object('upserted',0,'skipped',0,
      'errors',jsonb_build_array('p_features must be a JSON array'),'unmapped',v_unmapped);
  END IF;
  IF jsonb_array_length(p_features) > 1000 THEN
    RETURN jsonb_build_object('upserted',0,'skipped',0,
      'errors',jsonb_build_array('batch too large (max 1000)'),'unmapped',v_unmapped);
  END IF;

  FOR v_feature IN SELECT * FROM jsonb_array_elements(p_features)
  LOOP
    BEGIN
      IF NULLIF(v_feature->>'external_id','') IS NULL THEN
        v_skipped := v_skipped + 1;
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'reason','missing external_id','source',v_feature->>'source'));
        CONTINUE;
      END IF;
      v_layer := NULLIF(v_feature->>'layer_id','');
      IF v_layer IS NULL OR NOT EXISTS (SELECT 1 FROM public.airspace_layers WHERE id = v_layer) THEN
        v_skipped := v_skipped + 1;
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'reason','unknown layer_id','layer_id',v_layer,'source',v_feature->>'source'));
        CONTINUE;
      END IF;
      IF (v_feature->>'zone_type') = 'OTHER' THEN
        v_raw_type := COALESCE(v_feature->'properties'->>'raw_type','unknown');
        v_key := (v_feature->>'source') || '::' || v_raw_type;
        v_unmapped := jsonb_set(v_unmapped, ARRAY[v_key],
          to_jsonb(COALESCE((v_unmapped->>v_key)::int,0)+1));
      END IF;

      INSERT INTO public.airspace_zones (
        source, external_id, country_code, layer_id,
        zone_type, restriction_type, display_class, theme,
        name, short_name, authority,
        lower_limit_m, upper_limit_m, lower_limit_raw, upper_limit_raw, altitude_reference,
        valid_from, valid_to, active,
        authority_rank, dedupe_key,
        properties, geom
      ) VALUES (
        v_feature->>'source',
        v_feature->>'external_id',
        v_feature->>'country_code',
        v_layer,
        v_feature->>'zone_type',
        v_feature->>'restriction_type',
        v_feature->>'display_class',
        v_feature->>'theme',
        v_feature->>'name',
        v_feature->>'short_name',
        v_feature->>'authority',
        NULLIF(v_feature->>'lower_limit_m','')::int,
        NULLIF(v_feature->>'upper_limit_m','')::int,
        v_feature->>'lower_limit_raw',
        v_feature->>'upper_limit_raw',
        v_feature->>'altitude_reference',
        NULLIF(v_feature->>'valid_from','')::timestamptz,
        NULLIF(v_feature->>'valid_to','')::timestamptz,
        COALESCE((v_feature->>'active')::boolean, true),
        COALESCE(NULLIF(v_feature->>'authority_rank','')::smallint, 50),
        NULLIF(v_feature->>'dedupe_key',''),
        COALESCE(v_feature->'properties', '{}'::jsonb),
        ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(v_feature->>'geometry'), 4326))
      )
      ON CONFLICT (source, country_code, external_id) WHERE external_id IS NOT NULL
      DO UPDATE SET
        layer_id=EXCLUDED.layer_id, zone_type=EXCLUDED.zone_type,
        restriction_type=EXCLUDED.restriction_type, display_class=EXCLUDED.display_class,
        theme=EXCLUDED.theme, name=EXCLUDED.name, short_name=EXCLUDED.short_name,
        authority=EXCLUDED.authority,
        lower_limit_m=EXCLUDED.lower_limit_m, upper_limit_m=EXCLUDED.upper_limit_m,
        lower_limit_raw=EXCLUDED.lower_limit_raw, upper_limit_raw=EXCLUDED.upper_limit_raw,
        altitude_reference=EXCLUDED.altitude_reference,
        valid_from=EXCLUDED.valid_from, valid_to=EXCLUDED.valid_to,
        active=EXCLUDED.active,
        authority_rank=EXCLUDED.authority_rank, dedupe_key=EXCLUDED.dedupe_key,
        properties=EXCLUDED.properties, geom=EXCLUDED.geom,
        updated_at=now();

      v_upserted := v_upserted + 1;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'reason', SQLERRM, 'external_id', v_feature->>'external_id'));
    END;
  END LOOP;

  RETURN jsonb_build_object('upserted',v_upserted,'skipped',v_skipped,
    'errors',v_errors,'unmapped',v_unmapped);
END;
$$;

-- Re-trigger sync
DO $$
DECLARE
  v_secret text; v_service_key text; v_req_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key FROM vault.decrypted_secrets WHERE name='service_role_key' LIMIT 1;
  SELECT net.http_post(
    url := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/sync-dk-drone-zones',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || v_service_key,
      'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 180000
  ) INTO v_req_id;
  RAISE NOTICE 'Sync re-triggered, request_id=%', v_req_id;
END $$;
