
-- View uses caller's privileges (not creator's)
ALTER VIEW public.airspace_shadow_parity_rollup SET (security_invoker = true);

-- Drop redundant service_role policies (service_role has BYPASSRLS)
DROP POLICY IF EXISTS "service_role manages shadow comparisons" ON public.airspace_shadow_comparisons;
DROP POLICY IF EXISTS "shadow_comparisons_service_select" ON public.airspace_shadow_comparisons;

-- Confirm RLS is enabled (no policies + RLS on = denied for everyone except service_role)
ALTER TABLE public.airspace_shadow_comparisons ENABLE ROW LEVEL SECURITY;

-- Ensure no view access leaked to authenticated/anon
REVOKE ALL ON public.airspace_shadow_parity_rollup FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.airspace_shadow_parity_rollup TO service_role;
