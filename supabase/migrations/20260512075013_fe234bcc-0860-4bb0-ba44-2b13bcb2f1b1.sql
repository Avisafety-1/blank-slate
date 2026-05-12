CREATE TABLE IF NOT EXISTS public.mission_approval_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  tier SMALLINT NOT NULL CHECK (tier BETWEEN 1 AND 4),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipients_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (mission_id, tier)
);

CREATE INDEX IF NOT EXISTS idx_mission_approval_reminders_mission ON public.mission_approval_reminders(mission_id);

ALTER TABLE public.mission_approval_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view approval reminders"
ON public.mission_approval_reminders
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'superadmin'::app_role)
);