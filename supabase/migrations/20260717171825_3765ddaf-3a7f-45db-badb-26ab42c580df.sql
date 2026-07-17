
-- Phase A3: Shadow comparison infrastructure for unified airspace logic
-- Additive only. No changes to existing tables or logic.

CREATE TABLE public.airspace_shadow_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  context TEXT NOT NULL,                       -- e.g. 'risk_assessment', 'mission_save', 'manual'
  country_code TEXT NOT NULL,                  -- 'DK', 'NO', ...
  mission_id UUID,                             -- optional link
  route_geojson JSONB,                         -- input route (LineString / MultiLineString)
  buffer_m INTEGER NOT NULL DEFAULT 0,
  legacy_zone_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  unified_zone_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  legacy_count INTEGER NOT NULL DEFAULT 0,
  unified_count INTEGER NOT NULL DEFAULT 0,
  only_in_legacy JSONB NOT NULL DEFAULT '[]'::jsonb,
  only_in_unified JSONB NOT NULL DEFAULT '[]'::jsonb,
  parity_pct NUMERIC(5,2),                     -- 0.00 - 100.00
  notes TEXT
);

GRANT ALL ON public.airspace_shadow_comparisons TO service_role;
-- No anon/authenticated grants: shadow logs are ops-only.

ALTER TABLE public.airspace_shadow_comparisons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role manages shadow comparisons"
  ON public.airspace_shadow_comparisons
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX airspace_shadow_comparisons_country_created_idx
  ON public.airspace_shadow_comparisons (country_code, created_at DESC);

CREATE INDEX airspace_shadow_comparisons_parity_idx
  ON public.airspace_shadow_comparisons (parity_pct)
  WHERE parity_pct IS NOT NULL;

-- Helper: log a shadow comparison result. Callable only by service_role (edge functions).
CREATE OR REPLACE FUNCTION public.log_airspace_shadow_comparison(
  p_context TEXT,
  p_country_code TEXT,
  p_mission_id UUID,
  p_route_geojson JSONB,
  p_buffer_m INTEGER,
  p_legacy_zone_ids JSONB,
  p_unified_zone_ids JSONB,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_legacy_count INT;
  v_unified_count INT;
  v_only_legacy JSONB;
  v_only_unified JSONB;
  v_intersection_count INT;
  v_union_count INT;
  v_parity NUMERIC(5,2);
  v_enabled BOOLEAN;
BEGIN
  -- Respect the shadow_logging kill switch
  SELECT (value = 'true') INTO v_enabled
    FROM public.app_config
   WHERE key = 'airspace_unified_shadow_logging';

  IF v_enabled IS DISTINCT FROM TRUE THEN
    RETURN NULL;
  END IF;

  v_legacy_count := COALESCE(jsonb_array_length(p_legacy_zone_ids), 0);
  v_unified_count := COALESCE(jsonb_array_length(p_unified_zone_ids), 0);

  -- Jaccard-style parity: |A ∩ B| / |A ∪ B|
  WITH l AS (SELECT jsonb_array_elements_text(p_legacy_zone_ids) AS zid),
       u AS (SELECT jsonb_array_elements_text(p_unified_zone_ids) AS zid),
       inter AS (SELECT zid FROM l INTERSECT SELECT zid FROM u),
       un    AS (SELECT zid FROM l UNION     SELECT zid FROM u),
       ol AS (SELECT zid FROM l EXCEPT SELECT zid FROM u),
       ou AS (SELECT zid FROM u EXCEPT SELECT zid FROM l)
  SELECT
    (SELECT count(*) FROM inter),
    (SELECT count(*) FROM un),
    COALESCE((SELECT jsonb_agg(zid) FROM ol), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(zid) FROM ou), '[]'::jsonb)
  INTO v_intersection_count, v_union_count, v_only_legacy, v_only_unified;

  IF v_union_count = 0 THEN
    v_parity := 100.00;  -- both empty = perfect parity
  ELSE
    v_parity := ROUND((v_intersection_count::numeric / v_union_count::numeric) * 100, 2);
  END IF;

  INSERT INTO public.airspace_shadow_comparisons (
    context, country_code, mission_id, route_geojson, buffer_m,
    legacy_zone_ids, unified_zone_ids, legacy_count, unified_count,
    only_in_legacy, only_in_unified, parity_pct, notes
  ) VALUES (
    p_context, p_country_code, p_mission_id, p_route_geojson, COALESCE(p_buffer_m, 0),
    p_legacy_zone_ids, p_unified_zone_ids, v_legacy_count, v_unified_count,
    v_only_legacy, v_only_unified, v_parity, p_notes
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_airspace_shadow_comparison(TEXT, TEXT, UUID, JSONB, INTEGER, JSONB, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_airspace_shadow_comparison(TEXT, TEXT, UUID, JSONB, INTEGER, JSONB, JSONB, TEXT) TO service_role;

-- Rollup view: last 7 days of parity per country/context. Ops-only.
CREATE OR REPLACE VIEW public.airspace_shadow_parity_rollup AS
SELECT
  country_code,
  context,
  count(*)                          AS samples,
  ROUND(AVG(parity_pct), 2)         AS avg_parity_pct,
  MIN(parity_pct)                   AS min_parity_pct,
  SUM((parity_pct < 99)::int)       AS below_99_count,
  MAX(created_at)                   AS last_sample_at
FROM public.airspace_shadow_comparisons
WHERE created_at > now() - interval '7 days'
GROUP BY country_code, context;

REVOKE ALL ON public.airspace_shadow_parity_rollup FROM PUBLIC;
GRANT SELECT ON public.airspace_shadow_parity_rollup TO service_role;
