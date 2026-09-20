CREATE TABLE public.drone_stream_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drone_id uuid NOT NULL REFERENCES public.drones(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (drone_id),
  UNIQUE (key_hash)
);

GRANT SELECT ON public.drone_stream_keys TO authenticated;
GRANT ALL ON public.drone_stream_keys TO service_role;

ALTER TABLE public.drone_stream_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can view stream keys"
ON public.drone_stream_keys
FOR SELECT
TO authenticated
USING (
  company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'administrator')
    OR public.is_superadmin(auth.uid())
  )
);

CREATE TABLE public.drone_live_streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drone_id uuid NOT NULL REFERENCES public.drones(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stream_path text NOT NULL,
  label text,
  active boolean NOT NULL DEFAULT true,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stream_path)
);

GRANT SELECT ON public.drone_live_streams TO authenticated;
GRANT ALL ON public.drone_live_streams TO service_role;

ALTER TABLE public.drone_live_streams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view live streams for accessible drones"
ON public.drone_live_streams
FOR SELECT
TO authenticated
USING (company_id = ANY (public.get_user_visible_company_ids(auth.uid())));

CREATE INDEX idx_drone_live_streams_active
  ON public.drone_live_streams (company_id, active, last_seen_at DESC);

CREATE TRIGGER update_drone_stream_keys_updated_at
BEFORE UPDATE ON public.drone_stream_keys
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_drone_live_streams_updated_at
BEFORE UPDATE ON public.drone_live_streams
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.can_view_drone_video(_user_id uuid, _drone_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.drones d
    WHERE d.id = _drone_id
      AND (
        d.company_id = ANY (public.get_user_visible_company_ids(_user_id))
        OR EXISTS (
          SELECT 1 FROM public.drone_personnel dp
          WHERE dp.drone_id = d.id AND dp.profile_id = _user_id
        )
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_view_drone_video(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_view_drone_video(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_view_drone_video(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_drone_video(uuid, uuid) TO service_role;