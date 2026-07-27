CREATE OR REPLACE FUNCTION public.search_message_recipients(_query text)
 RETURNS TABLE(id uuid, full_name text, email text, company_id uuid, company_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_super BOOLEAN;
  visible_ids UUID[];
  q TEXT := COALESCE(NULLIF(TRIM(_query), ''), '');
  pattern TEXT := '%' || q || '%';
BEGIN
  is_super := public.has_role(auth.uid(), 'superadmin'::app_role);

  IF is_super THEN
    RETURN QUERY
      SELECT p.id, p.full_name, p.email, p.company_id, c.navn AS company_name
      FROM public.profiles p
      LEFT JOIN public.companies c ON c.id = p.company_id
      WHERE p.id <> auth.uid()
        AND (q = '' OR p.full_name ILIKE pattern OR p.email ILIKE pattern)
      ORDER BY p.full_name NULLS LAST
      LIMIT 50;
  ELSE
    visible_ids := public.get_user_visible_company_ids(auth.uid());
    RETURN QUERY
      SELECT p.id, p.full_name, p.email, p.company_id, c.navn AS company_name
      FROM public.profiles p
      LEFT JOIN public.companies c ON c.id = p.company_id
      WHERE p.id <> auth.uid()
        AND p.company_id = ANY (visible_ids)
        AND (q = '' OR p.full_name ILIKE pattern OR p.email ILIKE pattern)
      ORDER BY p.full_name NULLS LAST
      LIMIT 200;
  END IF;
END;
$function$;