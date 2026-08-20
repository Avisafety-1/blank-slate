CREATE OR REPLACE FUNCTION public.get_mission_filter_options(
  p_tab text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_pilot_id uuid DEFAULT NULL,
  p_drone_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH vm AS (
    SELECT m.id, m.customer_id
    FROM public.missions m
    WHERE p_tab IS NULL
       OR (p_tab = 'active' AND m.status IN ('Planlagt','Pågående'))
       OR (p_tab = 'completed' AND m.status IN ('Fullført','Avbrutt'))
  ),
  f AS (
    SELECT vm.id, vm.customer_id,
      (p_customer_id IS NULL OR vm.customer_id = p_customer_id) AS ok_customer,
      (p_pilot_id IS NULL OR EXISTS (
        SELECT 1 FROM public.mission_personnel mp
        WHERE mp.mission_id = vm.id AND mp.profile_id = p_pilot_id
      )) AS ok_pilot,
      (p_drone_id IS NULL OR EXISTS (
        SELECT 1 FROM public.mission_drones md
        WHERE md.mission_id = vm.id AND md.drone_id = p_drone_id
      )) AS ok_drone
    FROM vm
  )
  SELECT jsonb_build_object(
    'customers', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'navn')
      FROM (
        SELECT DISTINCT jsonb_build_object('id', c.id, 'navn', c.navn) AS x
        FROM f JOIN public.customers c ON c.id = f.customer_id
        WHERE f.ok_pilot AND f.ok_drone
      ) s
    ), '[]'::jsonb),
    'pilots', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'full_name')
      FROM (
        SELECT DISTINCT jsonb_build_object('id', p.id, 'full_name', p.full_name) AS x
        FROM public.mission_personnel mp
        JOIN f ON f.id = mp.mission_id
        JOIN public.profiles p ON p.id = mp.profile_id
        WHERE p.full_name IS NOT NULL AND f.ok_customer AND f.ok_drone
      ) s
    ), '[]'::jsonb),
    'drones', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'modell')
      FROM (
        SELECT DISTINCT jsonb_build_object('id', d.id, 'modell', d.modell, 'serienummer', d.serienummer) AS x
        FROM public.mission_drones md
        JOIN f ON f.id = md.mission_id
        JOIN public.drones d ON d.id = md.drone_id
        WHERE f.ok_customer AND f.ok_pilot
      ) s
    ), '[]'::jsonb)
  );
$function$;