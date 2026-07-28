-- 1) Recipients junction table
CREATE TABLE IF NOT EXISTS public.internal_message_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.internal_messages(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read','done')),
  read_at TIMESTAMPTZ,
  done_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, recipient_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.internal_message_recipients TO authenticated;
GRANT ALL ON public.internal_message_recipients TO service_role;

ALTER TABLE public.internal_message_recipients ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_imr_recipient ON public.internal_message_recipients(recipient_id, status);
CREATE INDEX IF NOT EXISTS idx_imr_message ON public.internal_message_recipients(message_id);

-- 2) Broadcast metadata on messages
ALTER TABLE public.internal_messages
  ADD COLUMN IF NOT EXISTS is_broadcast BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS broadcast_scope JSONB;

-- 3) Backfill existing rows into the junction table
INSERT INTO public.internal_message_recipients (message_id, recipient_id, status, read_at, done_at, created_at)
SELECT m.id, m.recipient_id, COALESCE(m.status,'unread'), m.read_at, m.done_at, m.created_at
FROM public.internal_messages m
WHERE m.recipient_id IS NOT NULL
ON CONFLICT (message_id, recipient_id) DO NOTHING;

-- 4) Thread participation helper (security definer to avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.is_thread_participant(_thread_root UUID, _user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.internal_messages m
    LEFT JOIN public.internal_message_recipients r ON r.message_id = m.id
    WHERE COALESCE(m.thread_root_id, m.id) = _thread_root
      AND m.is_broadcast = false
      AND (m.sender_id = _user OR m.recipient_id = _user OR r.recipient_id = _user)
  );
$$;

-- 5) RLS for the junction table
DROP POLICY IF EXISTS "Recipients see own rows" ON public.internal_message_recipients;
CREATE POLICY "Recipients see own rows"
ON public.internal_message_recipients FOR SELECT
TO authenticated
USING (
  recipient_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.internal_messages m
    WHERE m.id = internal_message_recipients.message_id
      AND (m.sender_id = auth.uid()
           OR public.is_thread_participant(COALESCE(m.thread_root_id, m.id), auth.uid()))
  )
);

DROP POLICY IF EXISTS "Recipients update own rows" ON public.internal_message_recipients;
CREATE POLICY "Recipients update own rows"
ON public.internal_message_recipients FOR UPDATE
TO authenticated
USING (recipient_id = auth.uid())
WITH CHECK (recipient_id = auth.uid());

DROP POLICY IF EXISTS "Senders add recipients" ON public.internal_message_recipients;
CREATE POLICY "Senders add recipients"
ON public.internal_message_recipients FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.internal_messages m
    WHERE m.id = internal_message_recipients.message_id
      AND m.sender_id = auth.uid()
  )
);

-- 6) Widen message visibility to thread participants
DROP POLICY IF EXISTS "Users see own inbox and sent" ON public.internal_messages;
CREATE POLICY "Users see own inbox and sent"
ON public.internal_messages FOR SELECT
TO authenticated
USING (
  recipient_id = auth.uid()
  OR sender_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.internal_message_recipients r
    WHERE r.message_id = internal_messages.id AND r.recipient_id = auth.uid()
  )
  OR public.is_thread_participant(COALESCE(thread_root_id, id), auth.uid())
);

-- 7) Broadcast audience resolver (Avisafe superadmins only)
CREATE OR REPLACE FUNCTION public.resolve_broadcast_audience(_mode TEXT, _company_ids UUID[] DEFAULT NULL)
RETURNS TABLE(id UUID, full_name TEXT, email TEXT, company_id UUID, company_name TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'superadmin'::app_role) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.companies c ON c.id = p.company_id
    WHERE p.id = auth.uid() AND lower(c.navn) = 'avisafe'
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
    SELECT p.id, p.full_name, p.email, p.company_id, c.navn AS company_name
    FROM public.profiles p
    LEFT JOIN public.companies c ON c.id = p.company_id
    WHERE p.id <> auth.uid()
      AND (
        _mode = 'all'
        OR (_mode = 'companies' AND p.company_id = ANY(COALESCE(_company_ids, ARRAY[]::UUID[])))
      )
    ORDER BY c.navn NULLS LAST, p.full_name NULLS LAST;
END;
$$;

-- 8) Company list for broadcast targeting (superadmin only)
CREATE OR REPLACE FUNCTION public.list_broadcast_companies()
RETURNS TABLE(id UUID, navn TEXT, user_count BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'superadmin'::app_role) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
    SELECT c.id, c.navn, COUNT(p.id) AS user_count
    FROM public.companies c
    LEFT JOIN public.profiles p ON p.company_id = c.id
    GROUP BY c.id, c.navn
    ORDER BY c.navn;
END;
$$;