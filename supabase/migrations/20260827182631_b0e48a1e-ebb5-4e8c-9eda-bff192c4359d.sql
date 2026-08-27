ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS long_flight_alert_hours integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS long_flight_email boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS long_flight_sms boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mission_start_alert_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS mission_start_alert_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mission_start_alert_sms boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.mission_start_alert_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, user_id)
);

GRANT SELECT ON public.mission_start_alert_sends TO authenticated;
GRANT ALL ON public.mission_start_alert_sends TO service_role;

ALTER TABLE public.mission_start_alert_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own mission start alerts"
ON public.mission_start_alert_sends
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_mission_start_alert_sends_mission
  ON public.mission_start_alert_sends (mission_id);