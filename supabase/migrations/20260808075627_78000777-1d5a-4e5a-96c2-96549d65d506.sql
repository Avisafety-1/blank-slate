REVOKE ALL ON FUNCTION public.get_company_names(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_names(uuid[]) TO authenticated, service_role;