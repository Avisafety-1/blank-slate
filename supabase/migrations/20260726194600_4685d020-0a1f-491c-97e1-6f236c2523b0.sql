
CREATE POLICY audit_attachments_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'audit-attachments'
    AND (
      public.has_role(auth.uid(), 'superadmin'::app_role)
      OR (
        (storage.foldername(name))[1]::uuid = ANY(public.get_user_visible_company_ids(auth.uid()))
      )
    )
  );

CREATE POLICY audit_attachments_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'audit-attachments'
    AND (
      public.has_role(auth.uid(), 'superadmin'::app_role)
      OR (
        (storage.foldername(name))[1]::uuid = ANY(public.get_user_visible_company_ids(auth.uid()))
      )
    )
  );

CREATE POLICY audit_attachments_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'audit-attachments'
    AND (
      public.has_role(auth.uid(), 'superadmin'::app_role)
      OR (
        (storage.foldername(name))[1]::uuid = ANY(public.get_user_visible_company_ids(auth.uid()))
      )
    )
  );

CREATE POLICY audit_attachments_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'audit-attachments'
    AND (
      public.has_role(auth.uid(), 'superadmin'::app_role)
      OR (
        (storage.foldername(name))[1]::uuid = ANY(public.get_user_visible_company_ids(auth.uid()))
      )
    )
  );
