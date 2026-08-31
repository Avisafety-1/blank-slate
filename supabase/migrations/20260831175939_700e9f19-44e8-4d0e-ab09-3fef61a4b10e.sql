DROP POLICY IF EXISTS "Approved users can create log entries in own company" ON public.drone_log_entries;
CREATE POLICY "Approved users can create log entries in visible companies"
ON public.drone_log_entries
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.approved = true)
  AND EXISTS (
    SELECT 1 FROM public.drones d
    WHERE d.id = drone_log_entries.drone_id
      AND (
        d.company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
        OR EXISTS (
          SELECT 1 FROM public.drone_department_visibility dv
          WHERE dv.drone_id = d.id
            AND dv.company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
        )
      )
  )
);

DROP POLICY IF EXISTS "Approved users can create equipment log entries in own company" ON public.equipment_log_entries;
CREATE POLICY "Approved users can create equipment log entries in visible companies"
ON public.equipment_log_entries
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.approved = true)
  AND EXISTS (
    SELECT 1 FROM public.equipment e
    WHERE e.id = equipment_log_entries.equipment_id
      AND (
        e.company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
        OR EXISTS (
          SELECT 1 FROM public.equipment_department_visibility ev
          WHERE ev.equipment_id = e.id
            AND ev.company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
        )
      )
  )
);