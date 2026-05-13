ALTER TABLE public.safesky_beacons
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS aircraft_model text,
  ADD COLUMN IF NOT EXISTS registration text,
  ADD COLUMN IF NOT EXISTS squawk text,
  ADD COLUMN IF NOT EXISTS on_ground boolean,
  ADD COLUMN IF NOT EXISTS accuracy_m numeric,
  ADD COLUMN IF NOT EXISTS last_update timestamptz;