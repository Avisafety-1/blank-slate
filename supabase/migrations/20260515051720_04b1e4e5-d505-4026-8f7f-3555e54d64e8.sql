ALTER TABLE public.flighthub2_webhook_config
  ADD COLUMN IF NOT EXISTS safesky_forward boolean NOT NULL DEFAULT false;