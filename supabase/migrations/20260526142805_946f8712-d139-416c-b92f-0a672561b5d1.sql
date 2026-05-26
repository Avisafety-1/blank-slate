ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS currency_requirement_2_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS currency_requirement_2_hours numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS currency_requirement_2_days integer NOT NULL DEFAULT 30;