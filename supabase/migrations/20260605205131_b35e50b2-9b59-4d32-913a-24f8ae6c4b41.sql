CREATE OR REPLACE FUNCTION public.get_active_fh2_feed_secrets(p_enc_key text)
RETURNS TABLE(company_id uuid, secret text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.company_id, c.api_key_encrypted
    FROM public.fh2_airspace_feed_config c
    WHERE c.enabled = true AND c.api_key_encrypted IS NOT NULL
  LOOP
    BEGIN
      company_id := r.company_id;
      secret := pgp_sym_decrypt(r.api_key_encrypted, p_enc_key);
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_fh2_feed_secrets(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_fh2_feed_secrets(text) TO service_role;