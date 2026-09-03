ALTER TABLE public.maintenance_schedules
  ADD COLUMN IF NOT EXISTS interval_cycles integer,
  ADD COLUMN IF NOT EXISTS warn_cycles integer,
  ADD COLUMN IF NOT EXISTS cycles_at_last integer;

ALTER TABLE public.maintenance_schedule_presets
  ADD COLUMN IF NOT EXISTS interval_cycles integer,
  ADD COLUMN IF NOT EXISTS warn_cycles integer;

ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS inspection_interval_cycles integer,
  ADD COLUMN IF NOT EXISTS varsel_sykluser integer,
  ADD COLUMN IF NOT EXISTS cycles_at_last_inspection integer;

UPDATE public.maintenance_schedule_presets
  SET interval_cycles = 200, warn_cycles = 20
  WHERE id = '56ed8f93-338a-452e-8233-3c5e4a1da055';

UPDATE public.maintenance_schedule_presets
  SET interval_cycles = 400, warn_cycles = 40
  WHERE id = '74ba08b4-e436-462a-af66-41749040bf54';

UPDATE public.maintenance_schedule_presets
  SET interval_cycles = 1500, warn_cycles = 100
  WHERE id = 'c54a7615-9ece-4e5f-b0f2-0387b405d583';