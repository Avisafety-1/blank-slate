-- Hjelpefunksjon: kan innlogget administrator skrive til en dokumentmappe (company-uuid)?
CREATE OR REPLACE FUNCTION public.can_write_document_folder(_folder text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN public.is_superadmin(auth.uid()) THEN true
    WHEN public.has_role(auth.uid(), 'administrator'::public.app_role)
         AND public.try_parse_uuid(_folder) IS NOT NULL
         AND public.try_parse_uuid(_folder) = ANY (public.get_user_visible_company_ids(auth.uid()))
    THEN true
    ELSE false
  END
$$;

REVOKE EXECUTE ON FUNCTION public.can_write_document_folder(text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_write_document_folder(text) TO authenticated;

-- INSERT: utvid eksisterende policy
DROP POLICY IF EXISTS "Users can upload to own company folder" ON storage.objects;
CREATE POLICY "Users can upload to own company folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (
    (storage.foldername(name))[1] = (
      SELECT (profiles.company_id)::text FROM public.profiles WHERE profiles.id = auth.uid()
    )
    OR public.can_write_document_folder((storage.foldername(name))[1])
  )
);

-- UPDATE: utvid eksisterende policy
DROP POLICY IF EXISTS "Users can update own company documents" ON storage.objects;
CREATE POLICY "Users can update own company documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    (storage.foldername(name))[1] = (
      SELECT (profiles.company_id)::text FROM public.profiles WHERE profiles.id = auth.uid()
    )
    OR public.can_write_document_folder((storage.foldername(name))[1])
  )
)
WITH CHECK (
  bucket_id = 'documents'
  AND (
    (storage.foldername(name))[1] = (
      SELECT (profiles.company_id)::text FROM public.profiles WHERE profiles.id = auth.uid()
    )
    OR public.can_write_document_folder((storage.foldername(name))[1])
  )
);

-- DELETE: utvid eksisterende policy
DROP POLICY IF EXISTS "Users can delete own company documents" ON storage.objects;
CREATE POLICY "Users can delete own company documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    (storage.foldername(name))[1] = (
      SELECT (profiles.company_id)::text FROM public.profiles WHERE profiles.id = auth.uid()
    )
    OR public.can_write_document_folder((storage.foldername(name))[1])
  )
);