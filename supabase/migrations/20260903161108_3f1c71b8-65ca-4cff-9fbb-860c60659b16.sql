CREATE TABLE public.maintenance_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  drone_id uuid REFERENCES public.drones(id) ON DELETE CASCADE,
  equipment_id uuid REFERENCES public.equipment(id) ON DELETE CASCADE,
  navn text NOT NULL,
  sjekkliste_id uuid,
  start_date timestamptz,
  interval_days integer,
  interval_hours numeric,
  interval_missions integer,
  warn_days integer,
  warn_hours numeric,
  warn_missions integer,
  last_performed_at timestamptz,
  next_due_date timestamptz,
  hours_at_last numeric DEFAULT 0,
  missions_at_last integer DEFAULT 0,
  email_alerts_enabled boolean NOT NULL DEFAULT true,
  notification_sent boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_schedules_one_resource CHECK (
    (drone_id IS NOT NULL AND equipment_id IS NULL) OR
    (drone_id IS NULL AND equipment_id IS NOT NULL)
  )
);

CREATE INDEX idx_maintenance_schedules_drone ON public.maintenance_schedules(drone_id);
CREATE INDEX idx_maintenance_schedules_equipment ON public.maintenance_schedules(equipment_id);
CREATE INDEX idx_maintenance_schedules_company ON public.maintenance_schedules(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_schedules TO authenticated;
GRANT ALL ON public.maintenance_schedules TO service_role;

ALTER TABLE public.maintenance_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view schedules in visible companies"
ON public.maintenance_schedules FOR SELECT TO authenticated
USING (company_id = ANY (public.get_user_visible_company_ids(auth.uid())));

CREATE POLICY "Users can insert schedules in visible companies"
ON public.maintenance_schedules FOR INSERT TO authenticated
WITH CHECK (company_id = ANY (public.get_user_visible_company_ids(auth.uid())));

CREATE POLICY "Users can update schedules in visible companies"
ON public.maintenance_schedules FOR UPDATE TO authenticated
USING (company_id = ANY (public.get_user_visible_company_ids(auth.uid())))
WITH CHECK (company_id = ANY (public.get_user_visible_company_ids(auth.uid())));

CREATE POLICY "Users can delete schedules in visible companies"
ON public.maintenance_schedules FOR DELETE TO authenticated
USING (company_id = ANY (public.get_user_visible_company_ids(auth.uid())));

CREATE TRIGGER update_maintenance_schedules_updated_at
BEFORE UPDATE ON public.maintenance_schedules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.maintenance_schedule_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  navn text NOT NULL,
  interval_days integer,
  interval_hours numeric,
  interval_missions integer,
  warn_days integer,
  warn_hours numeric,
  warn_missions integer,
  email_alerts_enabled boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_maintenance_presets_company ON public.maintenance_schedule_presets(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_schedule_presets TO authenticated;
GRANT ALL ON public.maintenance_schedule_presets TO service_role;

ALTER TABLE public.maintenance_schedule_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view presets in visible companies"
ON public.maintenance_schedule_presets FOR SELECT TO authenticated
USING (company_id = ANY (public.get_user_visible_company_ids(auth.uid())));

CREATE POLICY "Users can insert presets in visible companies"
ON public.maintenance_schedule_presets FOR INSERT TO authenticated
WITH CHECK (company_id = ANY (public.get_user_visible_company_ids(auth.uid())));

CREATE POLICY "Users can update presets in visible companies"
ON public.maintenance_schedule_presets FOR UPDATE TO authenticated
USING (company_id = ANY (public.get_user_visible_company_ids(auth.uid())))
WITH CHECK (company_id = ANY (public.get_user_visible_company_ids(auth.uid())));

CREATE POLICY "Users can delete presets in visible companies"
ON public.maintenance_schedule_presets FOR DELETE TO authenticated
USING (company_id = ANY (public.get_user_visible_company_ids(auth.uid())));

CREATE TRIGGER update_maintenance_presets_updated_at
BEFORE UPDATE ON public.maintenance_schedule_presets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.drone_inspections
  ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES public.maintenance_schedules(id) ON DELETE SET NULL;