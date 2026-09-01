ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid NULL;

COMMENT ON COLUMN public.profiles.is_active IS 'false = konto deaktivert (innlogging blokkert via auth ban), beholdes som normal bruker i systemet';