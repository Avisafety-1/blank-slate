CREATE OR REPLACE FUNCTION public.document_is_shared_with_user(_document_id uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.document_department_visibility v
    WHERE v.document_id = _document_id
      AND v.company_id = ANY (public.get_user_visible_company_ids(_user))
  )
$$;

CREATE OR REPLACE FUNCTION public.document_owner_company(_document_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.company_id FROM public.documents d WHERE d.id = _document_id
$$;

REVOKE ALL ON FUNCTION public.document_is_shared_with_user(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.document_owner_company(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.document_is_shared_with_user(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.document_owner_company(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.document_is_shared_with_user(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.document_owner_company(uuid) TO service_role;

DROP POLICY IF EXISTS "Users can view documents shared with their department" ON public.documents;
CREATE POLICY "Users can view documents shared with their department"
ON public.documents FOR SELECT TO authenticated
USING (public.document_is_shared_with_user(id, auth.uid()));

DROP POLICY IF EXISTS "Users can view document sharing rows they are involved in" ON public.document_department_visibility;
CREATE POLICY "Users can view document sharing rows they are involved in"
ON public.document_department_visibility FOR SELECT TO authenticated
USING (
  company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
  OR public.document_owner_company(document_id) = ANY (public.get_user_visible_company_ids(auth.uid()))
);

DROP POLICY IF EXISTS "Owner admins can unshare documents" ON public.document_department_visibility;
CREATE POLICY "Owner admins can unshare documents"
ON public.document_department_visibility FOR DELETE TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR (
    public.document_owner_company(document_id) = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'administrator'::app_role))
  )
);

DROP POLICY IF EXISTS "Owner admins can share documents" ON public.document_department_visibility;
CREATE POLICY "Owner admins can share documents"
ON public.document_department_visibility FOR INSERT TO authenticated
WITH CHECK (
  public.is_superadmin(auth.uid())
  OR (
    public.document_owner_company(document_id) = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'administrator'::app_role))
  )
);