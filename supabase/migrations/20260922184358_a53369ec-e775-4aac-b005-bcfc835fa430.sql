CREATE OR REPLACE FUNCTION public.sync_profile_to_resend_audience()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_secret text;
  v_payload jsonb;
BEGIN
  SELECT value INTO v_url FROM private.app_settings WHERE key = 'resend_audience_sync_url';
  SELECT value INTO v_secret FROM private.app_settings WHERE key = 'resend_audience_sync_secret';

  IF v_url IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.email IS NULL THEN RETURN OLD; END IF;
    v_payload := jsonb_build_object(
      'action', 'delete',
      'email', OLD.email,
      'user_id', OLD.id
    );
  ELSE
    IF NEW.email IS NULL THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND NEW.email IS NOT DISTINCT FROM OLD.email
       AND NEW.full_name IS NOT DISTINCT FROM OLD.full_name THEN
      RETURN NEW;
    END IF;
    v_payload := jsonb_build_object(
      'action', 'upsert',
      'email', NEW.email,
      'old_email', CASE WHEN TG_OP = 'UPDATE' THEN OLD.email ELSE NULL END,
      'first_name', split_part(COALESCE(NEW.full_name, ''), ' ', 1),
      'last_name', NULLIF(regexp_replace(COALESCE(NEW.full_name, ''), '^\S+\s*', ''), ''),
      'user_id', NEW.id
    );
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', COALESCE(v_secret, '')
    ),
    body := v_payload
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sync_profile_to_resend_audience failed: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_deleted_user_emails()
RETURNS TABLE(email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT lower(a.payload->'traits'->>'user_email')
  FROM auth.audit_log_entries a
  WHERE a.payload->>'action' = 'user_deleted'
    AND a.payload->'traits'->>'user_email' IS NOT NULL
$$;

REVOKE EXECUTE ON FUNCTION public.get_deleted_user_emails() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_deleted_user_emails() TO service_role;