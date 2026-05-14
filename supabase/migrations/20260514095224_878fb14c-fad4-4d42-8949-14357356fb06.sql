
-- 1. Private schema for sensitive config (not exposed via PostgREST)
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.app_settings FROM PUBLIC, anon, authenticated;

-- Copy existing vault secrets into private settings (postgres has access to vault)
INSERT INTO private.app_settings (key, value)
SELECT 'resend_audience_sync_url', decrypted_secret
FROM vault.decrypted_secrets WHERE name = 'resend_audience_sync_url'
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

INSERT INTO private.app_settings (key, value)
SELECT 'resend_audience_sync_secret', decrypted_secret
FROM vault.decrypted_secrets WHERE name = 'resend_audience_sync_secret'
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Fallback URL if vault secret was missing
INSERT INTO private.app_settings (key, value)
VALUES ('resend_audience_sync_url', 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/sync-user-to-resend-audience')
ON CONFLICT (key) DO NOTHING;

-- 2. Per-company audience mapping
CREATE TABLE IF NOT EXISTS public.resend_company_audiences (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  audience_id text,
  audience_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.resend_company_audiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmin full access to resend_company_audiences"
ON public.resend_company_audiences
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'superadmin'))
WITH CHECK (has_role(auth.uid(), 'superadmin'));

CREATE TRIGGER trg_resend_company_audiences_updated
BEFORE UPDATE ON public.resend_company_audiences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed Norconsult + Tensio
INSERT INTO public.resend_company_audiences (company_id, audience_name, enabled) VALUES
  ('3562f82d-aff7-487b-9495-7f288a5bc0e3', 'Norconsult', true),
  ('50c5b8af-639f-431d-89d5-91196cdc2cd8', 'Tensio', true)
ON CONFLICT (company_id) DO NOTHING;

-- 3. Helper: walk to root company id
CREATE OR REPLACE FUNCTION public.get_root_company_id(_company_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE chain AS (
    SELECT id, parent_company_id, 0 AS depth
    FROM public.companies WHERE id = _company_id
    UNION ALL
    SELECT c.id, c.parent_company_id, chain.depth + 1
    FROM public.companies c
    JOIN chain ON c.id = chain.parent_company_id
    WHERE chain.depth < 20
  )
  SELECT id FROM chain WHERE parent_company_id IS NULL LIMIT 1;
$$;

-- 4. Updated trigger function: read from private.app_settings, include user_id
CREATE OR REPLACE FUNCTION public.sync_profile_to_resend_audience()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, private
AS $function$
DECLARE
  v_url text;
  v_secret text;
  v_payload jsonb;
  v_first text;
  v_last text;
BEGIN
  SELECT value INTO v_url    FROM private.app_settings WHERE key = 'resend_audience_sync_url';
  SELECT value INTO v_secret FROM private.app_settings WHERE key = 'resend_audience_sync_secret';

  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF (TG_OP = 'DELETE') THEN
    IF OLD.email IS NULL OR OLD.email = '' THEN RETURN OLD; END IF;
    v_payload := jsonb_build_object('action', 'delete', 'email', OLD.email, 'user_id', OLD.id);

  ELSIF (TG_OP = 'INSERT') THEN
    IF NEW.email IS NULL OR NEW.email = '' THEN RETURN NEW; END IF;
    v_first := split_part(COALESCE(NEW.full_name, ''), ' ', 1);
    v_last  := NULLIF(regexp_replace(COALESCE(NEW.full_name, ''), '^\S+\s*', ''), '');
    v_payload := jsonb_build_object(
      'action', 'upsert',
      'email', NEW.email,
      'first_name', v_first,
      'last_name', COALESCE(v_last, ''),
      'user_id', NEW.id
    );

  ELSIF (TG_OP = 'UPDATE') THEN
    IF COALESCE(NEW.email, '') = COALESCE(OLD.email, '')
       AND COALESCE(NEW.full_name, '') = COALESCE(OLD.full_name, '')
       AND COALESCE(NEW.company_id::text, '') = COALESCE(OLD.company_id::text, '') THEN
      RETURN NEW;
    END IF;
    IF NEW.email IS NULL OR NEW.email = '' THEN RETURN NEW; END IF;

    v_first := split_part(COALESCE(NEW.full_name, ''), ' ', 1);
    v_last  := NULLIF(regexp_replace(COALESCE(NEW.full_name, ''), '^\S+\s*', ''), '');
    v_payload := jsonb_build_object(
      'action', 'upsert',
      'email', NEW.email,
      'first_name', v_first,
      'last_name', COALESCE(v_last, ''),
      'old_email', OLD.email,
      'user_id', NEW.id
    );
  END IF;

  IF v_payload IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  PERFORM extensions.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', v_secret
    ),
    body := v_payload
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sync_profile_to_resend_audience failed: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Also fire on company_id change so users get re-routed if moved between companies
DROP TRIGGER IF EXISTS trg_profiles_resend_audience_upd ON public.profiles;
CREATE TRIGGER trg_profiles_resend_audience_upd
AFTER UPDATE OF email, full_name, company_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_to_resend_audience();
