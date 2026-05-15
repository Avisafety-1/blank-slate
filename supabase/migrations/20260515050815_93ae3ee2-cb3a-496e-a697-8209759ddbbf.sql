
CREATE TABLE public.flighthub2_webhook_config (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  flight_hub_organization_id text UNIQUE,
  token_encrypted bytea,
  enabled boolean NOT NULL DEFAULT false,
  last_received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.flighthub2_webhook_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own company webhook config"
ON public.flighthub2_webhook_config FOR SELECT
TO authenticated
USING (company_id = ANY (public.get_user_visible_company_ids(auth.uid())));

CREATE POLICY "Admins can insert own company webhook config"
ON public.flighthub2_webhook_config FOR INSERT
TO authenticated
WITH CHECK (
  company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'))
);

CREATE POLICY "Admins can update own company webhook config"
ON public.flighthub2_webhook_config FOR UPDATE
TO authenticated
USING (
  company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'))
);

CREATE POLICY "Admins can delete own company webhook config"
ON public.flighthub2_webhook_config FOR DELETE
TO authenticated
USING (
  company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'))
);

CREATE TABLE public.flighthub2_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id text NOT NULL,
  sn text NOT NULL,
  manufacturer_id text,
  uas_id text,
  uas_model text,
  flight_status text NOT NULL,
  time_stamp timestamptz NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  height_m double precision,
  height_type smallint,
  altitude_m double precision,
  vert_speed_ms double precision,
  ground_speed_ms double precision,
  course_deg double precision,
  remote_id_status smallint,
  coordinate_system smallint,
  drone_id uuid REFERENCES public.drones(id) ON DELETE SET NULL,
  mission_id uuid REFERENCES public.missions(id) ON DELETE SET NULL,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fh2_positions_company_time
  ON public.flighthub2_positions (company_id, time_stamp DESC);
CREATE INDEX idx_fh2_positions_sn_time
  ON public.flighthub2_positions (sn, time_stamp DESC);
CREATE INDEX idx_fh2_positions_order
  ON public.flighthub2_positions (order_id);

ALTER TABLE public.flighthub2_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own company positions"
ON public.flighthub2_positions FOR SELECT
TO authenticated
USING (company_id = ANY (public.get_user_visible_company_ids(auth.uid())));

CREATE OR REPLACE FUNCTION public.save_fh2_webhook_token(
  p_company_id uuid,
  p_org_id text,
  p_token text,
  p_key text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  INSERT INTO public.flighthub2_webhook_config (company_id, flight_hub_organization_id, token_encrypted, enabled, updated_at)
  VALUES (p_company_id, p_org_id, pgp_sym_encrypt(p_token, p_key), true, now())
  ON CONFLICT (company_id) DO UPDATE
    SET flight_hub_organization_id = EXCLUDED.flight_hub_organization_id,
        token_encrypted = EXCLUDED.token_encrypted,
        enabled = true,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_fh2_webhook_token_by_org(
  p_org_id text,
  p_key text
) RETURNS TABLE(company_id uuid, token text, enabled boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT c.company_id,
         pgp_sym_decrypt(c.token_encrypted, p_key)::text,
         c.enabled
  FROM public.flighthub2_webhook_config c
  WHERE c.flight_hub_organization_id = p_org_id
    AND c.token_encrypted IS NOT NULL
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_fh2_webhook_received(p_company_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.flighthub2_webhook_config
  SET last_received_at = now()
  WHERE company_id = p_company_id;
$$;

CREATE OR REPLACE FUNCTION public.purge_old_flighthub2_positions()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.flighthub2_positions
  WHERE created_at < now() - interval '7 days';
$$;

CREATE TRIGGER trg_fh2_webhook_config_updated
BEFORE UPDATE ON public.flighthub2_webhook_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
