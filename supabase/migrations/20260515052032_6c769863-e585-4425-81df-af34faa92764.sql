DROP FUNCTION IF EXISTS public.get_fh2_webhook_token_by_org(text, text);

CREATE OR REPLACE FUNCTION public.get_fh2_webhook_token_by_org(
  p_org_id text,
  p_key text
) RETURNS TABLE(company_id uuid, token text, enabled boolean, safesky_forward boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT c.company_id,
         pgp_sym_decrypt(c.token_encrypted, p_key)::text,
         c.enabled,
         COALESCE(c.safesky_forward, false)
  FROM public.flighthub2_webhook_config c
  WHERE c.flight_hub_organization_id = p_org_id
    AND c.token_encrypted IS NOT NULL
  LIMIT 1;
END;
$$;