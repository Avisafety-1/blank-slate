ALTER TABLE public.flight_logs
  ADD COLUMN IF NOT EXISTS battery2_sn text,
  ADD COLUMN IF NOT EXISTS battery2_cycles integer,
  ADD COLUMN IF NOT EXISTS battery2_full_capacity_mah integer,
  ADD COLUMN IF NOT EXISTS battery2_voltage_min_v numeric,
  ADD COLUMN IF NOT EXISTS battery2_temp_max_c numeric,
  ADD COLUMN IF NOT EXISTS battery2_cell_deviation_max_v numeric;

CREATE INDEX IF NOT EXISTS idx_flight_logs_battery2_sn ON public.flight_logs (battery2_sn) WHERE battery2_sn IS NOT NULL;