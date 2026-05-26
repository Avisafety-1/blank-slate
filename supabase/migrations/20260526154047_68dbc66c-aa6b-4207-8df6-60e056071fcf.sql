-- Track last currency status per pilot per rule to detect transitions
CREATE TABLE IF NOT EXISTS public.currency_status_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  rule_index int NOT NULL CHECK (rule_index IN (1, 2)),
  last_status text NOT NULL CHECK (last_status IN ('green', 'yellow', 'red')),
  last_notified_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id, rule_index)
);

GRANT SELECT ON public.currency_status_log TO authenticated;
GRANT ALL ON public.currency_status_log TO service_role;

ALTER TABLE public.currency_status_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own currency status"
  ON public.currency_status_log
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_currency_status_log_user ON public.currency_status_log(user_id);

-- New notification preferences for currency warnings (email + push)
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS email_currency_warning boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_currency_expired boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_currency_warning boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_currency_expired boolean NOT NULL DEFAULT true;