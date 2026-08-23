ALTER TABLE public.drones ADD COLUMN IF NOT EXISTS dji_aircraft_name text;
CREATE INDEX IF NOT EXISTS idx_drones_company_dji_name ON public.drones (company_id, lower(dji_aircraft_name));