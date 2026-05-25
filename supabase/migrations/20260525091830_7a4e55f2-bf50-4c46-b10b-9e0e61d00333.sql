ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS flight_time_affects_status boolean NOT NULL DEFAULT false;