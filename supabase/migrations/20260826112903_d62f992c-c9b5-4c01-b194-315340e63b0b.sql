CREATE TABLE public.user_dronelog_keys (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  api_key_encrypted text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_dronelog_keys TO service_role;

ALTER TABLE public.user_dronelog_keys ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_user_dronelog_keys_updated_at
BEFORE UPDATE ON public.user_dronelog_keys
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();