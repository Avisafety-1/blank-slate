
-- =====================================================================
-- Phase A5: Scalable European airspace architecture
-- =====================================================================

-- 1) Layer lookup table (binds DB rows to UI toggle buttons)
CREATE TABLE IF NOT EXISTS public.airspace_layers (
  id text PRIMARY KEY,
  group_key text NOT NULL,
  default_enabled boolean NOT NULL DEFAULT false,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.airspace_layers TO anon, authenticated;
GRANT ALL ON public.airspace_layers TO service_role;

ALTER TABLE public.airspace_layers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "airspace_layers readable by all" ON public.airspace_layers;
CREATE POLICY "airspace_layers readable by all"
  ON public.airspace_layers FOR SELECT
  USING (true);

-- Seed layers exactly matching src/config/mapLayers.ts MAP_LAYER_CATALOG
INSERT INTO public.airspace_layers (id, group_key, default_enabled, description) VALUES
  ('airspace',            'Luftrom',            true,  'Generic controlled airspace (CTR, TMA, FIR)'),
  ('rpas',                'Luftrom',            true,  '5 km RPAS notification zones around airports'),
  ('nsm',                 'Luftrom',            true,  'National security prohibited zones'),
  ('aip',                 'Luftrom',            false, 'P/R/D zones from AIP'),
  ('rmz_tmz_atz',         'Luftrom',            true,  'RMZ / TMZ / ATZ'),
  ('restriksjonsomrader', 'Restriksjoner',      false, 'National drone restriction zones (non-AIP)'),
  ('fareomrader',         'Restriksjoner',      false, 'Danger areas'),
  ('sikringsobjekter',    'Restriksjoner',      false, 'Protected objects / infrastructure'),
  ('notam',               'Restriksjoner',      true,  'Active NOTAMs'),
  ('verneomrader',        'Natur & befolkning', false, 'Nature conservation areas'),
  ('befolkning',          'Natur & befolkning', false, 'Population density'),
  ('tettsteder',          'Natur & befolkning', false, 'Populated places'),
  ('arealbruk',           'Natur & befolkning', false, 'Land use'),
  ('luftfartshindre',     'Infrastruktur',      false, 'Aviation obstacles'),
  ('kraftledninger',      'Infrastruktur',      false, 'Power lines'),
  ('eiendomsgrenser',     'Infrastruktur',      false, 'Property boundaries'),
  ('flyplasser',          'Infrastruktur',      true,  'Airports / aerodromes')
ON CONFLICT (id) DO NOTHING;

-- 2) Extend airspace_zones with layer_id, authority_rank, dedupe_key
ALTER TABLE public.airspace_zones
  ADD COLUMN IF NOT EXISTS layer_id text,
  ADD COLUMN IF NOT EXISTS authority_rank smallint NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS dedupe_key text;

-- 3) Backfill existing DK rows to sensible layer_ids
UPDATE public.airspace_zones
   SET layer_id = 'restriksjonsomrader'
 WHERE source = 'trafikstyrelsen_dk' AND layer_id IS NULL;

UPDATE public.airspace_zones
   SET layer_id = 'verneomrader'
 WHERE source = 'trafikstyrelsen_dk_nature' AND layer_id IS NULL;

-- Ensure raw_type is preserved in properties for QA (backfill from typeId/Farve)
UPDATE public.airspace_zones z
   SET properties = z.properties
       || jsonb_build_object('raw_type',
            COALESCE(z.properties->>'raw_type',
                     z.properties->>'typeId',
                     z.properties->>'Farve',
                     'unknown'))
 WHERE (z.properties ? 'raw_type') IS NOT TRUE;

-- 4) Constraints
ALTER TABLE public.airspace_zones
  ALTER COLUMN layer_id SET NOT NULL;

ALTER TABLE public.airspace_zones
  DROP CONSTRAINT IF EXISTS airspace_zones_authority_rank_range,
  ADD CONSTRAINT airspace_zones_authority_rank_range
    CHECK (authority_rank BETWEEN 0 AND 100);

ALTER TABLE public.airspace_zones
  DROP CONSTRAINT IF EXISTS airspace_zones_layer_id_fk,
  ADD CONSTRAINT airspace_zones_layer_id_fk
    FOREIGN KEY (layer_id) REFERENCES public.airspace_layers(id);

-- Relax external_id (allow NULL for future adapters using dedupe_key only,
-- but bulk_upsert continues to require it).
ALTER TABLE public.airspace_zones
  ALTER COLUMN external_id DROP NOT NULL;

-- Partial unique index (NULL external_id bypasses uniqueness)
DROP INDEX IF EXISTS airspace_zones_source_country_external_uk;
CREATE UNIQUE INDEX airspace_zones_source_country_external_uk
  ON public.airspace_zones (source, country_code, external_id)
  WHERE external_id IS NOT NULL;

-- Composite lookup index for UI queries
CREATE INDEX IF NOT EXISTS airspace_zones_country_layer_active_ix
  ON public.airspace_zones (country_code, layer_id, active);

-- 5) Precedence view (single scan with window functions)
DROP VIEW IF EXISTS public.resolved_airspace_zones CASCADE;
DROP VIEW IF EXISTS public.airspace_zones_with_precedence CASCADE;

CREATE VIEW public.airspace_zones_with_precedence
WITH (security_invoker = true) AS
SELECT
  z.*,
  CASE
    WHEN z.active
     AND (z.valid_from IS NULL OR z.valid_from <= now())
     AND (z.valid_to   IS NULL OR z.valid_to   >  now())
     AND z.dedupe_key IS NOT NULL
    THEN ROW_NUMBER() OVER (
      PARTITION BY z.country_code, z.layer_id, z.dedupe_key
      ORDER BY z.authority_rank ASC, z.updated_at DESC
    )
    ELSE NULL
  END AS precedence_rank
FROM public.airspace_zones z;

CREATE VIEW public.resolved_airspace_zones
WITH (security_invoker = true) AS
SELECT *
FROM public.airspace_zones_with_precedence
WHERE active
  AND (valid_from IS NULL OR valid_from <= now())
  AND (valid_to   IS NULL OR valid_to   >  now())
  AND (dedupe_key IS NULL OR precedence_rank = 1);

GRANT SELECT ON public.airspace_zones_with_precedence TO anon, authenticated, service_role;
GRANT SELECT ON public.resolved_airspace_zones       TO anon, authenticated, service_role;

-- 6) Source health view with top unresolved raw_types
DROP VIEW IF EXISTS public.airspace_source_health CASCADE;
CREATE VIEW public.airspace_source_health
WITH (security_invoker = true) AS
WITH raw AS (
  SELECT source, country_code, layer_id, zone_type, active,
         properties->>'raw_type' AS raw_type,
         updated_at
    FROM public.airspace_zones
)
SELECT
  source,
  country_code,
  count(*)                                                     AS total_rows,
  count(*) FILTER (WHERE active)                               AS active_rows,
  count(*) FILTER (WHERE zone_type = 'OTHER')                  AS unclassified_rows,
  count(DISTINCT layer_id)                                     AS distinct_layers,
  max(updated_at)                                              AS last_updated_at,
  (
    SELECT jsonb_agg(jsonb_build_object('raw_type', rt, 'n', n) ORDER BY n DESC)
      FROM (
        SELECT raw_type AS rt, count(*) AS n
          FROM raw r2
         WHERE r2.source = raw.source
           AND r2.country_code = raw.country_code
           AND r2.zone_type = 'OTHER'
         GROUP BY raw_type
         ORDER BY count(*) DESC
         LIMIT 5
      ) t
  ) AS top_unmapped_raw_types
FROM raw
GROUP BY source, country_code;

GRANT SELECT ON public.airspace_source_health TO authenticated, service_role;

-- 7) bulk_upsert_airspace_zones v2:
--    - accepts numeric buffers (jsonb passthrough — no signature change)
--    - accepts layer_id / authority_rank / dedupe_key
--    - rejects rows missing external_id (returned in `skipped`)
--    - returns `unmapped` array of {source, raw_type, count} for QA
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
    RETURN jsonb_build_object('upserted', 0, 'skipped', 0,
                              'errors',  jsonb_build_array('p_features must be a JSON array'),
                              'unmapped', v_unmapped);
  END IF;

  IF jsonb_array_length(p_features) > 1000 THEN
    RETURN jsonb_build_object('upserted', 0, 'skipped', 0,
                              'errors',  jsonb_build_array('batch too large (max 1000)'),
                              'unmapped', v_unmapped);
  END IF;

  FOR v_feature IN SELECT * FROM jsonb_array_elements(p_features)
  LOOP
    BEGIN
      -- Reject rows without stable external_id (idempotency guard)
      IF NULLIF(v_feature->>'external_id','') IS NULL THEN
        v_skipped := v_skipped + 1;
        v_errors := v_errors || jsonb_build_array(
          jsonb_build_object('reason','missing external_id',
                             'source', v_feature->>'source'));
        CONTINUE;
      END IF;

      v_layer := NULLIF(v_feature->>'layer_id','');
      IF v_layer IS NULL OR NOT EXISTS (SELECT 1 FROM public.airspace_layers WHERE id = v_layer) THEN
        v_skipped := v_skipped + 1;
        v_errors := v_errors || jsonb_build_array(
          jsonb_build_object('reason','unknown layer_id',
                             'layer_id', v_layer,
                             'source',   v_feature->>'source'));
        CONTINUE;
      END IF;

      -- Track unmapped raw_types (zone_type = OTHER) for QA
      IF (v_feature->>'zone_type') = 'OTHER' THEN
        v_raw_type := COALESCE(v_feature->'properties'->>'raw_type', 'unknown');
        v_key := (v_feature->>'source') || '::' || v_raw_type;
        v_unmapped := jsonb_set(
          v_unmapped, ARRAY[v_key],
          to_jsonb( COALESCE((v_unmapped->>v_key)::int, 0) + 1 )
        );
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
        ST_SetSRID(ST_GeomFromGeoJSON(v_feature->>'geometry'), 4326)
      )
      ON CONFLICT (source, country_code, external_id) WHERE external_id IS NOT NULL
      DO UPDATE SET
        layer_id           = EXCLUDED.layer_id,
        zone_type          = EXCLUDED.zone_type,
        restriction_type   = EXCLUDED.restriction_type,
        display_class      = EXCLUDED.display_class,
        theme              = EXCLUDED.theme,
        name               = EXCLUDED.name,
        short_name         = EXCLUDED.short_name,
        authority          = EXCLUDED.authority,
        lower_limit_m      = EXCLUDED.lower_limit_m,
        upper_limit_m      = EXCLUDED.upper_limit_m,
        lower_limit_raw    = EXCLUDED.lower_limit_raw,
        upper_limit_raw    = EXCLUDED.upper_limit_raw,
        altitude_reference = EXCLUDED.altitude_reference,
        valid_from         = EXCLUDED.valid_from,
        valid_to           = EXCLUDED.valid_to,
        active             = EXCLUDED.active,
        authority_rank     = EXCLUDED.authority_rank,
        dedupe_key         = EXCLUDED.dedupe_key,
        properties         = EXCLUDED.properties,
        geom               = EXCLUDED.geom,
        updated_at         = now();

      v_upserted := v_upserted + 1;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object('reason', SQLERRM,
                           'external_id', v_feature->>'external_id'));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'upserted', v_upserted,
    'skipped',  v_skipped,
    'errors',   v_errors,
    'unmapped', v_unmapped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_upsert_airspace_zones(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_upsert_airspace_zones(jsonb) TO service_role;

-- 8) Route/bbox RPCs — DROP+CREATE (adding columns changes return signature)
DROP FUNCTION IF EXISTS public.airspace_zones_in_bbox(double precision, double precision, double precision, double precision, text[], text[]);
DROP FUNCTION IF EXISTS public.airspace_zones_intersecting_route(jsonb, integer, text[], text[]);

CREATE FUNCTION public.airspace_zones_in_bbox(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_zone_types text[] DEFAULT NULL,
  p_country_codes text[] DEFAULT NULL,
  p_layer_ids text[] DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  country_code text,
  source text,
  layer_id text,
  zone_type text,
  restriction_type text,
  display_class text,
  theme text,
  name text,
  short_name text,
  lower_limit_m integer,
  upper_limit_m integer,
  altitude_reference text,
  authority_rank smallint,
  dedupe_key text,
  geometry_geojson jsonb,
  properties jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT r.id, r.country_code, r.source, r.layer_id, r.zone_type, r.restriction_type,
         r.display_class, r.theme, r.name, r.short_name,
         r.lower_limit_m, r.upper_limit_m, r.altitude_reference,
         r.authority_rank, r.dedupe_key,
         ST_AsGeoJSON(r.geom)::jsonb AS geometry_geojson,
         r.properties
    FROM public.resolved_airspace_zones r
   WHERE ST_Intersects(
           r.geom,
           ST_MakeEnvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)
         )
     AND (p_zone_types    IS NULL OR r.zone_type    = ANY(p_zone_types))
     AND (p_country_codes IS NULL OR r.country_code = ANY(p_country_codes))
     AND (p_layer_ids     IS NULL OR r.layer_id     = ANY(p_layer_ids));
$$;

CREATE FUNCTION public.airspace_zones_intersecting_route(
  p_route jsonb,
  p_buffer_m integer,
  p_zone_types text[] DEFAULT NULL,
  p_country_codes text[] DEFAULT NULL,
  p_layer_ids text[] DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  country_code text,
  source text,
  layer_id text,
  zone_type text,
  restriction_type text,
  display_class text,
  theme text,
  name text,
  short_name text,
  lower_limit_m integer,
  upper_limit_m integer,
  altitude_reference text,
  authority_rank smallint,
  dedupe_key text,
  distance_m double precision,
  route_inside boolean,
  properties jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_route geometry;
  v_buffer int;
BEGIN
  v_buffer := LEAST(GREATEST(COALESCE(p_buffer_m, 0), 0), 100000);
  v_route  := ST_SetSRID(ST_GeomFromGeoJSON(p_route::text), 4326);

  RETURN QUERY
  SELECT r.id, r.country_code, r.source, r.layer_id, r.zone_type, r.restriction_type,
         r.display_class, r.theme, r.name, r.short_name,
         r.lower_limit_m, r.upper_limit_m, r.altitude_reference,
         r.authority_rank, r.dedupe_key,
         ST_Distance(r.geom::geography, v_route::geography) AS distance_m,
         ST_Intersects(r.geom, v_route)                     AS route_inside,
         r.properties
    FROM public.resolved_airspace_zones r
   WHERE ST_DWithin(r.geom::geography, v_route::geography, v_buffer)
     AND (p_zone_types    IS NULL OR r.zone_type    = ANY(p_zone_types))
     AND (p_country_codes IS NULL OR r.country_code = ANY(p_country_codes))
     AND (p_layer_ids     IS NULL OR r.layer_id     = ANY(p_layer_ids));
END;
$$;

GRANT EXECUTE ON FUNCTION public.airspace_zones_in_bbox(double precision,double precision,double precision,double precision,text[],text[],text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.airspace_zones_intersecting_route(jsonb,integer,text[],text[],text[]) TO anon, authenticated, service_role;
