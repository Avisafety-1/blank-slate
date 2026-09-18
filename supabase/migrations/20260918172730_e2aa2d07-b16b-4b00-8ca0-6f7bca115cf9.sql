CREATE OR REPLACE FUNCTION public.cleanup_pending_dji_logs(p_batch_size integer DEFAULT 500, p_max_batches integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_approved integer := 0;
  v_dismissed integer := 0;
  v_n integer;
  i integer;
BEGIN
  FOR i IN 1..p_max_batches LOOP
    WITH cand AS (
      SELECT p.id
      FROM public.pending_dji_logs p
      JOIN public.flight_logs f ON f.id = p.processed_flight_log_id
      WHERE p.status = 'approved'
        AND p.parsed_result IS NOT NULL
        AND COALESCE((p.parsed_result->>'slimmed')::boolean, false) = false
        AND f.flight_track IS NOT NULL
      LIMIT p_batch_size
    )
    UPDATE public.pending_dji_logs t
    SET parsed_result = jsonb_strip_nulls(jsonb_build_object(
      'sha256Hash',  t.parsed_result->>'sha256Hash',
      'djiFileName', t.parsed_result->>'djiFileName',
      'aircraftName', t.parsed_result->>'aircraftName',
      'aircraftSN',  t.parsed_result->>'aircraftSN',
      'source',      t.parsed_result->>'source'
    )) || jsonb_build_object('slimmed', true)
    FROM cand
    WHERE t.id = cand.id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_approved := v_approved + v_n;
    EXIT WHEN v_n = 0;
  END LOOP;

  FOR i IN 1..p_max_batches LOOP
    WITH cand AS (
      SELECT p.id
      FROM public.pending_dji_logs p
      WHERE p.status = 'dismissed'
        AND p.created_at < now() - interval '30 days'
        AND p.parsed_result IS NOT NULL
        AND COALESCE((p.parsed_result->>'slimmed')::boolean, false) = false
      LIMIT p_batch_size
    )
    UPDATE public.pending_dji_logs t
    SET parsed_result = jsonb_strip_nulls(jsonb_build_object(
      'sha256Hash',  t.parsed_result->>'sha256Hash',
      'djiFileName', t.parsed_result->>'djiFileName',
      'aircraftName', t.parsed_result->>'aircraftName',
      'aircraftSN',  t.parsed_result->>'aircraftSN',
      'source',      t.parsed_result->>'source'
    )) || jsonb_build_object('slimmed', true)
    FROM cand
    WHERE t.id = cand.id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_dismissed := v_dismissed + v_n;
    EXIT WHEN v_n = 0;
  END LOOP;

  RETURN jsonb_build_object('approved_slimmed', v_approved, 'dismissed_slimmed', v_dismissed);
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_pending_dji_logs(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_pending_dji_logs(integer, integer) TO service_role;