-- 1. Table
CREATE TABLE IF NOT EXISTS public.company_mqtt_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_company_id UUID NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  password_encrypted BYTEA NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Grants
GRANT SELECT ON public.company_mqtt_credentials TO authenticated;
GRANT ALL ON public.company_mqtt_credentials TO service_role;

-- 3. RLS
ALTER TABLE public.company_mqtt_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can see own MQTT credential row"
  ON public.company_mqtt_credentials FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin')
    OR (
      public.has_role(auth.uid(), 'administrator')
      AND owner_company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
    )
  );

-- 4. Helper: which company owns the credential set for a given company
CREATE OR REPLACE FUNCTION public.get_mqtt_credential_owner(p_company_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(c.parent_company_id, c.id) FROM public.companies c WHERE c.id = p_company_id;
$$;

-- 5. Save / upsert credentials for a company group
CREATE OR REPLACE FUNCTION public.save_company_mqtt_credentials(
  p_company_id UUID, p_username TEXT, p_password TEXT, p_key TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_owner UUID; v_id UUID;
BEGIN
  v_owner := public.get_mqtt_credential_owner(p_company_id);
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Unknown company'; END IF;

  INSERT INTO public.company_mqtt_credentials (owner_company_id, username, password_encrypted, updated_at)
  VALUES (v_owner, p_username, pgp_sym_encrypt(p_password, p_key), now())
  ON CONFLICT (owner_company_id) DO UPDATE
    SET password_encrypted = pgp_sym_encrypt(p_password, p_key),
        updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 6. Read credentials for a company (resolves to the group owner)
CREATE OR REPLACE FUNCTION public.get_company_mqtt_credentials(p_company_id UUID, p_key TEXT)
RETURNS TABLE(
  owner_company_id UUID,
  owner_company_name TEXT,
  username TEXT,
  password TEXT,
  enabled BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  shared_company_ids UUID[],
  shared_company_names TEXT[]
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_owner UUID;
BEGIN
  v_owner := public.get_mqtt_credential_owner(p_company_id);
  IF v_owner IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    cr.owner_company_id,
    oc.navn,
    cr.username,
    pgp_sym_decrypt(cr.password_encrypted, p_key),
    cr.enabled,
    cr.created_at,
    cr.updated_at,
    ARRAY(SELECT c.id FROM public.companies c WHERE c.id = v_owner OR c.parent_company_id = v_owner ORDER BY c.navn),
    ARRAY(SELECT c.navn FROM public.companies c WHERE c.id = v_owner OR c.parent_company_id = v_owner ORDER BY c.navn)
  FROM public.company_mqtt_credentials cr
  JOIN public.companies oc ON oc.id = cr.owner_company_id
  WHERE cr.owner_company_id = v_owner;
END;
$$;

-- 7. Broker feed: all active credential sets with their allowed serial numbers
CREATE OR REPLACE FUNCTION public.get_all_mqtt_broker_credentials(p_key TEXT)
RETURNS TABLE(
  username TEXT,
  password TEXT,
  owner_company_id UUID,
  company_ids UUID[],
  serial_numbers TEXT[]
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE r RECORD; v_group UUID[];
BEGIN
  FOR r IN SELECT cr.username, cr.password_encrypted, cr.owner_company_id
           FROM public.company_mqtt_credentials cr WHERE cr.enabled = true
  LOOP
    BEGIN
      v_group := ARRAY(
        SELECT c.id FROM public.companies c
        WHERE c.id = r.owner_company_id OR c.parent_company_id = r.owner_company_id
      );

      username := r.username;
      password := pgp_sym_decrypt(r.password_encrypted, p_key);
      owner_company_id := r.owner_company_id;
      company_ids := v_group;
      serial_numbers := ARRAY(
        SELECT DISTINCT s FROM (
          -- (a) drones owned by the group
          SELECT d.serienummer AS s
          FROM public.drones d
          WHERE d.company_id = ANY(v_group)
            AND d.serienummer IS NOT NULL AND length(trim(d.serienummer)) > 0
          UNION
          -- (b) drones the group's personnel are authorised to fly (cross-company)
          SELECT d.serienummer AS s
          FROM public.drone_personnel dp
          JOIN public.drones d ON d.id = dp.drone_id
          JOIN public.profiles p ON p.id = dp.profile_id
          WHERE p.company_id = ANY(v_group)
            AND d.serienummer IS NOT NULL AND length(trim(d.serienummer)) > 0
        ) q
      );
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;
  RETURN;
END;
$$;

-- 8. Lock down direct execution from clients (edge functions use service role)
REVOKE EXECUTE ON FUNCTION public.save_company_mqtt_credentials(uuid, text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_company_mqtt_credentials(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_all_mqtt_broker_credentials(text) FROM anon, authenticated;