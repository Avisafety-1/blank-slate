CREATE TABLE public.battery_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  manufacturer text,
  drone_models text[] NOT NULL DEFAULT '{}',
  design_capacity_mah integer,
  cell_count integer,
  nominal_voltage_v numeric,
  max_cycles integer,
  health_warn_pct numeric NOT NULL DEFAULT 80,
  health_critical_pct numeric NOT NULL DEFAULT 60,
  cell_deviation_warn_v numeric NOT NULL DEFAULT 0.05,
  cell_deviation_critical_v numeric NOT NULL DEFAULT 0.10,
  max_temp_c numeric,
  capacity_min_mah integer,
  capacity_max_mah integer,
  voltage_min_v numeric,
  voltage_max_v numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.battery_types TO authenticated;
GRANT ALL ON public.battery_types TO service_role;

ALTER TABLE public.battery_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "battery_types_select"
ON public.battery_types FOR SELECT TO authenticated
USING (
  company_id IS NULL
  OR company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
);

CREATE POLICY "battery_types_insert"
ON public.battery_types FOR INSERT TO authenticated
WITH CHECK (
  (company_id IS NOT NULL
    AND public.can_user_access_company(auth.uid(), company_id)
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin')))
  OR (company_id IS NULL AND public.has_role(auth.uid(), 'superadmin'))
);

CREATE POLICY "battery_types_update"
ON public.battery_types FOR UPDATE TO authenticated
USING (
  (company_id IS NOT NULL
    AND public.can_user_access_company(auth.uid(), company_id)
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin')))
  OR (company_id IS NULL AND public.has_role(auth.uid(), 'superadmin'))
)
WITH CHECK (
  (company_id IS NOT NULL
    AND public.can_user_access_company(auth.uid(), company_id)
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin')))
  OR (company_id IS NULL AND public.has_role(auth.uid(), 'superadmin'))
);

CREATE POLICY "battery_types_delete"
ON public.battery_types FOR DELETE TO authenticated
USING (
  (company_id IS NOT NULL
    AND public.can_user_access_company(auth.uid(), company_id)
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin')))
  OR (company_id IS NULL AND public.has_role(auth.uid(), 'superadmin'))
);

CREATE TRIGGER battery_types_set_updated_at
BEFORE UPDATE ON public.battery_types
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_battery_types_company ON public.battery_types(company_id);
CREATE INDEX idx_battery_types_models ON public.battery_types USING GIN (drone_models);

ALTER TABLE public.equipment
  ADD COLUMN battery_type_id uuid REFERENCES public.battery_types(id) ON DELETE SET NULL,
  ADD COLUMN battery_type_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN battery_design_capacity_mah integer,
  ADD COLUMN battery_max_cycles integer,
  ADD COLUMN battery_health_warn_pct numeric,
  ADD COLUMN battery_health_critical_pct numeric,
  ADD COLUMN battery_cell_deviation_warn_v numeric,
  ADD COLUMN battery_cell_deviation_critical_v numeric;

INSERT INTO public.battery_types
  (company_id, name, manufacturer, drone_models, design_capacity_mah, cell_count, nominal_voltage_v, max_cycles, capacity_min_mah, capacity_max_mah, voltage_min_v, voltage_max_v, max_temp_c)
VALUES
  (NULL, 'DJI BWX260 (Mavic 3-serien)', 'DJI', ARRAY['DJI Mavic 3 Classic','DJI Mavic 3 Pro / Cine','DJI Mavic 3 Enterprise','DJI Mavic 3 Thermal'], 5000, 4, 15.4, 200, 4200, 5300, 14.0, 17.6, 70),
  (NULL, 'DJI Mavic 4 Pro batteri', 'DJI', ARRAY['DJI Mavic 4 Pro'], 6654, 4, 14.76, 200, 5800, 7000, 14.0, 17.6, 70),
  (NULL, 'DJI Mavic 2 batteri', 'DJI', ARRAY['DJI Mavic 2 Pro'], 3850, 4, 15.4, 200, 3200, 4100, 14.0, 17.6, 70),
  (NULL, 'DJI Air 3 / 3S batteri', 'DJI', ARRAY['DJI Air 3','DJI Air 3S'], 4241, 4, 14.76, 200, 3700, 4500, 14.0, 17.6, 70),
  (NULL, 'DJI Air 2S batteri', 'DJI', ARRAY['DJI Air 2S'], 3500, 3, 11.55, 200, 3000, 3700, 10.5, 13.2, 70),
  (NULL, 'DJI Mini 3 / 4 batteri', 'DJI', ARRAY['DJI Mini 3 / Mini 3 Pro','DJI Mini 4 Pro','DJI Mini 5','DJI Flip'], 2453, 2, 7.38, 200, 2000, 3000, 6.5, 8.8, 70),
  (NULL, 'DJI Mini 2 SE batteri', 'DJI', ARRAY['DJI Mini 2 SE'], 2250, 2, 7.7, 200, 1900, 2600, 6.5, 8.8, 70),
  (NULL, 'DJI TB30 (Matrice 30-serien)', 'DJI', ARRAY['DJI Matrice 30','DJI Matrice 30T'], 5880, 6, 26.1, 400, 5200, 6300, 23.0, 27.0, 70),
  (NULL, 'DJI TB65 (Matrice 350 RTK)', 'DJI', ARRAY['DJI Matrice 350 RTK'], 5880, 12, 52.8, 400, 5200, 6300, 42.0, 54.0, 70),
  (NULL, 'DJI TB60 (Matrice 300 RTK)', 'DJI', ARRAY['DJI Matrice 300 RTK'], 5935, 12, 52.8, 400, 5200, 6400, 42.0, 54.0, 70),
  (NULL, 'DJI Matrice 4-serien batteri', 'DJI', ARRAY['DJI Matrice 4E','DJI Matrice 4T','DJI Matrice 4D','DJI Matrice 4TD'], 6768, 4, 15.4, 400, 6000, 7200, 14.0, 17.6, 70),
  (NULL, 'DJI Matrice 400 batteri', 'DJI', ARRAY['DJI Matrice 400'], NULL, 12, 52.8, 400, NULL, NULL, 42.0, 54.0, 70),
  (NULL, 'DJI TB51 (Inspire 3)', 'DJI', ARRAY['DJI Inspire 3'], 4280, 6, 23.1, 200, 3700, 4600, 20.0, 26.0, 70),
  (NULL, 'DJI Avata batteri', 'DJI', ARRAY['DJI Avata','DJI Avata 2','DJI FPV'], 2150, 4, 14.76, 200, 1800, 2600, 14.0, 17.6, 70),
  (NULL, 'DJI DB2000 (FlyCart 30)', 'DJI', ARRAY['DJI FlyCart 30'], 38000, 14, 52.22, 1500, 30000, 42000, 42.0, 60.0, 70),
  (NULL, 'DJI FlyCart 100 batteri', 'DJI', ARRAY['DJI FlyCart 100'], NULL, NULL, NULL, 1500, NULL, NULL, NULL, NULL, 70);