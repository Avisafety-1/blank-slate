-- PT-14: Per-user unsubscribe token for weekly report unsubscribe links
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS unsubscribe_token UUID DEFAULT gen_random_uuid();

UPDATE public.profiles
  SET unsubscribe_token = gen_random_uuid()
  WHERE unsubscribe_token IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN unsubscribe_token SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_unsubscribe_token_unique'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_unsubscribe_token_unique UNIQUE (unsubscribe_token);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_unsubscribe_token
  ON public.profiles(unsubscribe_token);