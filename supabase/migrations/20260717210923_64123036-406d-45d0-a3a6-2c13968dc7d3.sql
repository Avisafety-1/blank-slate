
-- Selskaps-allowlist for unified airspace (C1 intern test)
CREATE TABLE public.airspace_unified_company_allowlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.airspace_unified_company_allowlist TO authenticated;
GRANT ALL ON public.airspace_unified_company_allowlist TO service_role;

ALTER TABLE public.airspace_unified_company_allowlist ENABLE ROW LEVEL SECURITY;

-- Innloggede brukere kan kun se sin egen rad (for RPC-en). Ingen får skrive fra klient.
CREATE POLICY "Users can read allowlist entry for their own company"
  ON public.airspace_unified_company_allowlist
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Superadmins manage allowlist"
  ON public.airspace_unified_company_allowlist
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'::app_role));

-- RPC: er unified aktiv for meg (dobbel sperre: master-flag OG selskap i allowlist).
CREATE OR REPLACE FUNCTION public.is_unified_airspace_enabled_for_me()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_master boolean;
  v_company uuid;
  v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT (value = 'true') INTO v_master
    FROM public.app_config
   WHERE key = 'airspace_unified_dk_enabled';

  IF v_master IS DISTINCT FROM true THEN
    RETURN false;
  END IF;

  SELECT company_id INTO v_company
    FROM public.profiles
   WHERE id = auth.uid();

  IF v_company IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.airspace_unified_company_allowlist
     WHERE company_id = v_company
  ) INTO v_allowed;

  RETURN COALESCE(v_allowed, false);
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.is_unified_airspace_enabled_for_me() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_unified_airspace_enabled_for_me() TO authenticated;

-- Seed: Moderavdeling er eneste selskap i C1-testfasen.
INSERT INTO public.airspace_unified_company_allowlist (company_id, note)
VALUES ('af43f04e-7a0a-4c42-a1e2-dfdc883a9600', 'C1 intern testfase - Moderavdeling')
ON CONFLICT (company_id) DO NOTHING;
