-- PT-11 backfill: set billing_user_id where null to first admin in company (oldest profile)
UPDATE public.companies c
SET billing_user_id = sub.user_id
FROM (
  SELECT DISTINCT ON (p.company_id) p.company_id, ur.user_id
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'admin'
  ORDER BY p.company_id, p.created_at ASC
) sub
WHERE c.id = sub.company_id AND c.billing_user_id IS NULL;