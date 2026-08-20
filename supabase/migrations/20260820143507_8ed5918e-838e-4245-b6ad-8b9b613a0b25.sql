CREATE OR REPLACE FUNCTION public.get_mission_filter_options()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH visible AS (
    SELECT unnest(public.get_user_visible_company_ids(auth.uid())) AS company_id
  ),
  vm AS (
    SELECT m.id, m.customer_id
    FROM public.missions m
    WHERE m.company_id IN (SELECT company_id FROM visible)
  )
  SELECT jsonb_build_object(
    'customers', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'navn')
      FROM (
        SELECT DISTINCT jsonb_build_object('id', c.id, 'navn', c.navn) AS x
        FROM vm JOIN public.customers c ON c.id = vm.customer_id
      ) s
    ), '[]'::jsonb),
    'pilots', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'full_name')
      FROM (
        SELECT DISTINCT jsonb_build_object('id', p.id, 'full_name', p.full_name) AS x
        FROM public.mission_personnel mp
        JOIN vm ON vm.id = mp.mission_id
        JOIN public.profiles p ON p.id = mp.profile_id
        WHERE p.full_name IS NOT NULL
      ) s
    ), '[]'::jsonb),
    'drones', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'modell')
      FROM (
        SELECT DISTINCT jsonb_build_object('id', d.id, 'modell', d.modell, 'serienummer', d.serienummer) AS x
        FROM public.mission_drones md
        JOIN vm ON vm.id = md.mission_id
        JOIN public.drones d ON d.id = md.drone_id
      ) s
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_mission_filter_options() TO authenticated;

CREATE INDEX IF NOT EXISTS idx_mission_personnel_profile_id ON public.mission_personnel(profile_id);
CREATE INDEX IF NOT EXISTS idx_mission_personnel_mission_id ON public.mission_personnel(mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_drones_drone_id ON public.mission_drones(drone_id);
CREATE INDEX IF NOT EXISTS idx_mission_drones_mission_id ON public.mission_drones(mission_id);
CREATE INDEX IF NOT EXISTS idx_missions_customer_id ON public.missions(customer_id);