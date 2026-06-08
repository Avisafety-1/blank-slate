
DROP POLICY IF EXISTS "Admins can delete news in own company" ON public.news;
DROP POLICY IF EXISTS "Admins can update news in own company" ON public.news;

CREATE POLICY "Admins can delete news in visible companies"
ON public.news FOR DELETE
USING (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'saksbehandler'::app_role))
  AND company_id = ANY (get_user_visible_company_ids(auth.uid()))
);

CREATE POLICY "Admins can update news in visible companies"
ON public.news FOR UPDATE
USING (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'saksbehandler'::app_role))
  AND company_id = ANY (get_user_visible_company_ids(auth.uid()))
);
