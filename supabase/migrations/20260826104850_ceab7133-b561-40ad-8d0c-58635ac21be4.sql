ALTER TABLE public.dji_credentials
  ADD COLUMN IF NOT EXISTS dronelog_api_key_encrypted text,
  ADD COLUMN IF NOT EXISTS dronelog_key_created_at timestamptz;