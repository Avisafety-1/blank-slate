ALTER TABLE public.evaluation_responses
  ADD COLUMN IF NOT EXISTS student_signature_url text,
  ADD COLUMN IF NOT EXISTS student_signed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS student_signature_name text;

CREATE OR REPLACE FUNCTION public.sign_evaluation_response(p_response_id uuid, p_signature_url text)
RETURNS TABLE(id uuid, student_signature_url text, student_signed_at timestamp with time zone, student_signature_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.evaluation_responses%ROWTYPE;
  v_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_signature_url IS NULL OR length(trim(p_signature_url)) = 0 THEN
    RAISE EXCEPTION 'Missing signature';
  END IF;

  SELECT * INTO v_row FROM public.evaluation_responses r WHERE r.id = p_response_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evaluation not found';
  END IF;
  IF v_row.student_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the student can sign this evaluation';
  END IF;
  IF v_row.status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Evaluation is not completed';
  END IF;
  IF v_row.student_signature_url IS NOT NULL THEN
    RAISE EXCEPTION 'Evaluation is already signed';
  END IF;

  SELECT COALESCE(p.full_name, p.email, v_row.student_name) INTO v_name
  FROM public.profiles p WHERE p.id = auth.uid();

  UPDATE public.evaluation_responses r
     SET student_signature_url = p_signature_url,
         student_signed_at = now(),
         student_signature_name = COALESCE(v_name, r.student_name),
         updated_at = now()
   WHERE r.id = p_response_id;

  RETURN QUERY
  SELECT r.id, r.student_signature_url, r.student_signed_at, r.student_signature_name
  FROM public.evaluation_responses r WHERE r.id = p_response_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sign_evaluation_response(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_evaluation_response(uuid, text) TO authenticated;