-- 1. UPDATE-policy: samme dokumentsjekk som INSERT i WITH CHECK
DROP POLICY IF EXISTS "Admins can update sora profiles" ON public.sora_document_profiles;
CREATE POLICY "Admins can update sora profiles" ON public.sora_document_profiles
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrator'::public.app_role)
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role)
     OR public.has_role(auth.uid(), 'administrator'::public.app_role))
    AND EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = sora_document_profiles.document_id
        AND d.company_id = sora_document_profiles.company_id
    )
  );

-- 2. Trigger: document_id og company_id kan ikke endres
CREATE OR REPLACE FUNCTION public.sora_profile_immutable_links()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.document_id IS DISTINCT FROM OLD.document_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'document_id and company_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sora_profile_immutable_links
  BEFORE UPDATE ON public.sora_document_profiles
  FOR EACH ROW EXECUTE FUNCTION public.sora_profile_immutable_links();

-- 3. Trigger: server-styrt bekreftelse (SECURITY INVOKER)
CREATE OR REPLACE FUNCTION public.sora_profile_enforce_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'confirmed' THEN
    IF TG_OP = 'INSERT'
       OR OLD.status <> 'confirmed'
       OR NEW.profile IS DISTINCT FROM OLD.profile
       OR NEW.source_file_url IS DISTINCT FROM OLD.source_file_url THEN
      NEW.confirmed_by := auth.uid();
      NEW.confirmed_at := now();
    ELSE
      NEW.confirmed_by := OLD.confirmed_by;
      NEW.confirmed_at := OLD.confirmed_at;
    END IF;
  ELSIF NEW.status = 'draft' THEN
    NEW.confirmed_by := NULL;
    NEW.confirmed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sora_profile_enforce_confirmation
  BEFORE INSERT OR UPDATE ON public.sora_document_profiles
  FOR EACH ROW EXECUTE FUNCTION public.sora_profile_enforce_confirmation();