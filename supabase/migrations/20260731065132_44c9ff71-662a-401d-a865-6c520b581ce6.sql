CREATE OR REPLACE FUNCTION public.get_pending_approval_notification_admins(_company_id uuid)
RETURNS TABLE (user_id uuid, is_parent boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH parent AS (
    SELECT c.parent_company_id AS pid FROM public.companies c WHERE c.id = _company_id
  ),
  admins AS (
    SELECT DISTINCT ur.user_id AS uid
    FROM public.user_roles ur
    WHERE ur.role IN ('admin', 'administrator', 'superadmin')
  ),
  home AS (
    SELECT a.uid, uc.company_id
    FROM admins a
    JOIN public.user_companies uc ON uc.user_id = a.uid
    UNION ALL
    SELECT a.uid, p.company_id
    FROM admins a
    JOIN public.profiles p ON p.id = a.uid
    WHERE NOT EXISTS (SELECT 1 FROM public.user_companies uc2 WHERE uc2.user_id = a.uid)
  )
  SELECT h.uid AS user_id,
         bool_and(h.company_id IS DISTINCT FROM _company_id) AS is_parent
  FROM home h, parent
  WHERE h.company_id = _company_id
     OR (parent.pid IS NOT NULL AND h.company_id = parent.pid)
  GROUP BY h.uid;
$$;