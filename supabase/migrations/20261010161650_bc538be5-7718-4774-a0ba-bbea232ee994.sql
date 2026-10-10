CREATE TABLE IF NOT EXISTS public.audit_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id uuid NOT NULL REFERENCES public.audit_findings(id) ON DELETE CASCADE,
  action_id uuid NULL REFERENCES public.audit_actions(id) ON DELETE CASCADE,
  kind text NOT NULL,
  recipient_id uuid NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS audit_notification_log_unique
  ON public.audit_notification_log (finding_id, COALESCE(action_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, recipient_id);
REVOKE ALL ON public.audit_notification_log FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.audit_notification_log TO service_role;
ALTER TABLE public.audit_notification_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS email_audit_tasks boolean NOT NULL DEFAULT true;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'audit-deadline-reminders') THEN
    PERFORM cron.unschedule('audit-deadline-reminders');
  END IF;
END $$;

SELECT cron.schedule(
  'audit-deadline-reminders',
  '0 5 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/audit-deadline-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret' LIMIT 1)
    ),
    body := jsonb_build_object('time', now())
  ) AS request_id;
  $cron$
);