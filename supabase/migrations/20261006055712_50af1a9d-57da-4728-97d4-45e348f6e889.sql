CREATE TABLE public.sora_document_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  source_file_url text NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed')),
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  consistency jsonb NULL,
  extraction_source text NULL CHECK (extraction_source IN ('ai','manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  extracted_at timestamptz NULL,
  confirmed_by uuid NULL,
  confirmed_at timestamptz NULL,
  CONSTRAINT sora_document_profiles_document_id_key UNIQUE (document_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sora_document_profiles TO authenticated;
GRANT ALL ON public.sora_document_profiles TO service_role;

ALTER TABLE public.sora_document_profiles ENABLE ROW LEVEL SECURITY;

-- Readable by anyone who can read the document (documents RLS applies inside EXISTS).
CREATE POLICY "Readers of the document can view its SORA profile"
ON public.sora_document_profiles FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = sora_document_profiles.document_id));

CREATE POLICY "Admins can insert SORA profiles in own company"
ON public.sora_document_profiles FOR INSERT TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'administrator'::public.app_role))
  AND company_id = public.get_user_company_id(auth.uid())
  AND EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.company_id = sora_document_profiles.company_id)
);

CREATE POLICY "Admins can update SORA profiles in own company"
ON public.sora_document_profiles FOR UPDATE TO authenticated
USING (
  (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'administrator'::public.app_role))
  AND company_id = public.get_user_company_id(auth.uid())
)
WITH CHECK (
  (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'administrator'::public.app_role))
  AND company_id = public.get_user_company_id(auth.uid())
);

CREATE POLICY "Admins can delete SORA profiles in own company"
ON public.sora_document_profiles FOR DELETE TO authenticated
USING (
  (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'administrator'::public.app_role))
  AND company_id = public.get_user_company_id(auth.uid())
);

CREATE TRIGGER update_sora_document_profiles_updated_at
BEFORE UPDATE ON public.sora_document_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();