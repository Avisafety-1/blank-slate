
-- Config (one row per company)
CREATE TABLE public.fh2_airspace_feed_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  api_key_encrypted bytea,
  api_key_prefix text,
  last_request_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fh2_airspace_feed_config TO authenticated;
GRANT ALL ON public.fh2_airspace_feed_config TO service_role;
ALTER TABLE public.fh2_airspace_feed_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read own company feed config"
ON public.fh2_airspace_feed_config FOR SELECT TO authenticated
USING (
  company_id = public.get_user_company_id(auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'))
);

-- Log table
CREATE TABLE public.fh2_airspace_feed_log (
  id bigserial PRIMARY KEY,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  method text NOT NULL,
  path text NOT NULL,
  query text,
  headers jsonb,
  body_preview text,
  remote_ip text,
  status_returned int,
  matched_key boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fh2_airspace_feed_log TO authenticated;
GRANT ALL ON public.fh2_airspace_feed_log TO service_role;
ALTER TABLE public.fh2_airspace_feed_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read own company feed log"
ON public.fh2_airspace_feed_log FOR SELECT TO authenticated
USING (
  company_id = public.get_user_company_id(auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'))
);

CREATE INDEX fh2_feed_log_company_created_idx ON public.fh2_airspace_feed_log (company_id, created_at DESC);

-- Updated-at trigger
CREATE TRIGGER fh2_feed_config_updated_at
BEFORE UPDATE ON public.fh2_airspace_feed_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: save key (encrypted)
CREATE OR REPLACE FUNCTION public.save_fh2_feed_key(
  p_company_id uuid,
  p_key text,
  p_enc_key text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF p_key IS NULL OR length(p_key) < 16 THEN
    RAISE EXCEPTION 'key_too_short';
  END IF;
  INSERT INTO public.fh2_airspace_feed_config (company_id, api_key_encrypted, api_key_prefix, enabled)
  VALUES (p_company_id, pgp_sym_encrypt(p_key, p_enc_key), left(p_key, 6), true)
  ON CONFLICT (company_id) DO UPDATE
  SET api_key_encrypted = EXCLUDED.api_key_encrypted,
      api_key_prefix = EXCLUDED.api_key_prefix,
      updated_at = now();
END;
$$;

-- RPC: lookup company_id by raw key (constant-ish; iterates configs)
CREATE OR REPLACE FUNCTION public.lookup_fh2_feed_company(
  p_key text,
  p_enc_key text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT company_id, api_key_encrypted FROM public.fh2_airspace_feed_config WHERE api_key_encrypted IS NOT NULL AND enabled = true LOOP
    BEGIN
      IF pgp_sym_decrypt(r.api_key_encrypted, p_enc_key) = p_key THEN
        RETURN r.company_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.save_fh2_feed_key(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lookup_fh2_feed_company(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_fh2_feed_key(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.lookup_fh2_feed_company(text, text) TO service_role;

-- Touch last_request_at
CREATE OR REPLACE FUNCTION public.touch_fh2_feed_request(p_company_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.fh2_airspace_feed_config SET last_request_at = now() WHERE company_id = p_company_id;
$$;
GRANT EXECUTE ON FUNCTION public.touch_fh2_feed_request(uuid) TO service_role;
