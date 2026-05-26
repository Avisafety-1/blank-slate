ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS currency_requirement_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS currency_requirement_hours numeric NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS currency_requirement_days integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS propagate_currency_requirement boolean NOT NULL DEFAULT false;