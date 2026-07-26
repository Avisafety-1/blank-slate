
-- ============================================================
-- Internal messaging for compliance reminders
-- ============================================================

CREATE TABLE public.internal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject text NOT NULL,
  body text NOT NULL,
  deep_link text,
  finding_key text,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('critical','warning','info')),
  status text NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read','done')),
  channels_sent jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_internal_messages_recipient ON public.internal_messages(recipient_id, status, created_at DESC);
CREATE INDEX idx_internal_messages_company ON public.internal_messages(company_id, created_at DESC);

GRANT SELECT, UPDATE ON public.internal_messages TO authenticated;
GRANT ALL ON public.internal_messages TO service_role;

ALTER TABLE public.internal_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own inbox and sent"
  ON public.internal_messages FOR SELECT TO authenticated
  USING (recipient_id = auth.uid() OR sender_id = auth.uid());

CREATE POLICY "Admins see company messages"
  ON public.internal_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','superadmin')
        AND p.company_id = internal_messages.company_id
    )
  );

CREATE POLICY "Recipient can update own message"
  ON public.internal_messages FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- No INSERT policy = only service_role (edge function) can create messages.

-- Receipts (send log per channel)
CREATE TABLE public.internal_message_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.internal_messages(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','sms','inbox')),
  status text NOT NULL CHECK (status IN ('sent','failed','skipped')),
  provider_id text,
  error text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_internal_message_receipts_message ON public.internal_message_receipts(message_id);

GRANT SELECT ON public.internal_message_receipts TO authenticated;
GRANT ALL ON public.internal_message_receipts TO service_role;

ALTER TABLE public.internal_message_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "See receipts for visible messages"
  ON public.internal_message_receipts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.internal_messages m
      WHERE m.id = internal_message_receipts.message_id
        AND (m.recipient_id = auth.uid() OR m.sender_id = auth.uid())
    )
  );

-- updated_at trigger
CREATE TRIGGER trg_internal_messages_updated
  BEFORE UPDATE ON public.internal_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_messages;
