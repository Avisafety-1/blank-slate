CREATE OR REPLACE FUNCTION public.can_read_document_file(_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.documents d
    WHERE d.fil_url = _object_name
      AND auth.uid() IS NOT NULL
      AND (
        d.company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
        OR d.global_visibility = true
        OR (
          d.visible_to_children = true
          AND d.company_id = public.get_parent_company_id(
            (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
          )
        )
        OR public.document_is_shared_with_user(d.id, auth.uid())
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_read_document_file(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_document_file(text) TO authenticated;

DROP POLICY IF EXISTS "Users can read own company documents" ON storage.objects;
CREATE POLICY "Users can read own company documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'documents'
  AND (
    ((storage.foldername(name))[1] IN (
      SELECT (unnest(get_user_visible_company_ids(auth.uid())))::text
    ))
    OR EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.fil_url = objects.name AND d.global_visibility = true
    )
    OR EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.fil_url = objects.name
        AND d.visible_to_children = true
        AND d.company_id = get_parent_company_id(
          (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
        )
    )
    OR public.can_read_document_file(objects.name)
  )
);