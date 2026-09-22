-- user_roles SELECT
DROP POLICY IF EXISTS "Admins can view roles in own company" ON public.user_roles;
CREATE POLICY "Admins can view roles in own company"
ON public.user_roles FOR SELECT TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrator'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = user_roles.user_id
      AND profiles.company_id = ANY (get_user_visible_company_ids(auth.uid()))
  )
);

-- drones
DROP POLICY IF EXISTS "Admins can update drones in own company" ON public.drones;
CREATE POLICY "Admins can update drones in own company"
ON public.drones FOR UPDATE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrator'::app_role)
   OR has_role(auth.uid(), 'saksbehandler'::app_role) OR is_superadmin(auth.uid()))
  AND company_id = get_user_company_id(auth.uid())
);

DROP POLICY IF EXISTS "Admins can delete drones in own company" ON public.drones;
CREATE POLICY "Admins can delete drones in own company"
ON public.drones FOR DELETE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrator'::app_role))
  AND company_id = get_user_company_id(auth.uid())
);

-- equipment
DROP POLICY IF EXISTS "Admins can update equipment in own company" ON public.equipment;
CREATE POLICY "Admins can update equipment in own company"
ON public.equipment FOR UPDATE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrator'::app_role)
   OR has_role(auth.uid(), 'saksbehandler'::app_role) OR is_superadmin(auth.uid()))
  AND company_id = get_user_company_id(auth.uid())
);

DROP POLICY IF EXISTS "Admins can delete equipment in own company" ON public.equipment;
CREATE POLICY "Admins can delete equipment in own company"
ON public.equipment FOR DELETE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrator'::app_role))
  AND company_id = get_user_company_id(auth.uid())
);

-- flight_logs
DROP POLICY IF EXISTS "Admins can manage flight logs in visible companies" ON public.flight_logs;
CREATE POLICY "Admins can manage flight logs in visible companies"
ON public.flight_logs FOR ALL TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrator'::app_role))
  AND company_id = ANY (get_user_visible_company_ids(auth.uid()))
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrator'::app_role))
  AND company_id = ANY (get_user_visible_company_ids(auth.uid()))
);

DROP POLICY IF EXISTS "Admins can manage flight log personnel in visible companies" ON public.flight_log_personnel;
CREATE POLICY "Admins can manage flight log personnel in visible companies"
ON public.flight_log_personnel FOR ALL TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrator'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.flight_logs fl
    WHERE fl.id = flight_log_personnel.flight_log_id
      AND fl.company_id = ANY (get_user_visible_company_ids(auth.uid()))
  )
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrator'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.flight_logs fl
    WHERE fl.id = flight_log_personnel.flight_log_id
      AND fl.company_id = ANY (get_user_visible_company_ids(auth.uid()))
  )
);

DROP POLICY IF EXISTS "Admins can manage flight log equipment in visible companies" ON public.flight_log_equipment;
CREATE POLICY "Admins can manage flight log equipment in visible companies"
ON public.flight_log_equipment FOR ALL TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrator'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.flight_logs fl
    WHERE fl.id = flight_log_equipment.flight_log_id
      AND fl.company_id = ANY (get_user_visible_company_ids(auth.uid()))
  )
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrator'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.flight_logs fl
    WHERE fl.id = flight_log_equipment.flight_log_id
      AND fl.company_id = ANY (get_user_visible_company_ids(auth.uid()))
  )
);

-- drone_log_entries
DROP POLICY IF EXISTS "Admins can update log entries in visible companies" ON public.drone_log_entries;
CREATE POLICY "Admins can update log entries in visible companies"
ON public.drone_log_entries FOR UPDATE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrator'::app_role))
  AND company_id = ANY (get_user_visible_company_ids(auth.uid()))
);

DROP POLICY IF EXISTS "Admins can delete log entries in visible companies" ON public.drone_log_entries;
CREATE POLICY "Admins can delete log entries in visible companies"
ON public.drone_log_entries FOR DELETE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrator'::app_role))
  AND company_id = ANY (get_user_visible_company_ids(auth.uid()))
);

-- equipment_log_entries
DROP POLICY IF EXISTS "Admins can update equipment log entries in visible companies" ON public.equipment_log_entries;
CREATE POLICY "Admins can update equipment log entries in visible companies"
ON public.equipment_log_entries FOR UPDATE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrator'::app_role))
  AND company_id = ANY (get_user_visible_company_ids(auth.uid()))
);

DROP POLICY IF EXISTS "Admins can delete equipment log entries in visible companies" ON public.equipment_log_entries;
CREATE POLICY "Admins can delete equipment log entries in visible companies"
ON public.equipment_log_entries FOR DELETE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrator'::app_role))
  AND company_id = ANY (get_user_visible_company_ids(auth.uid()))
);

-- incidents
DROP POLICY IF EXISTS "Admins can update incidents in own company" ON public.incidents;
CREATE POLICY "Admins can update incidents in own company"
ON public.incidents FOR UPDATE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrator'::app_role)
   OR has_role(auth.uid(), 'saksbehandler'::app_role))
  AND company_id = ANY (get_user_visible_company_ids(auth.uid()))
);

DROP POLICY IF EXISTS "Admins can delete incidents in own company" ON public.incidents;
CREATE POLICY "Admins can delete incidents in own company"
ON public.incidents FOR DELETE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrator'::app_role))
  AND company_id = get_user_company_id(auth.uid())
);

-- missions
DROP POLICY IF EXISTS "Admins can delete missions in own company" ON public.missions;
CREATE POLICY "Admins can delete missions in own company"
ON public.missions FOR DELETE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrator'::app_role))
  AND company_id = get_user_company_id(auth.uid())
);

-- email templates and settings
DROP POLICY IF EXISTS "Admins can manage email templates in own company" ON public.email_templates;
CREATE POLICY "Admins can manage email templates in own company"
ON public.email_templates FOR ALL TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrator'::app_role))
  AND company_id = get_user_company_id(auth.uid())
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrator'::app_role))
  AND company_id = get_user_company_id(auth.uid())
);

DROP POLICY IF EXISTS "Admins can manage email settings in own company" ON public.email_settings;
CREATE POLICY "Admins can manage email settings in own company"
ON public.email_settings FOR ALL TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrator'::app_role))
  AND company_id = get_user_company_id(auth.uid())
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrator'::app_role))
  AND company_id = get_user_company_id(auth.uid())
);