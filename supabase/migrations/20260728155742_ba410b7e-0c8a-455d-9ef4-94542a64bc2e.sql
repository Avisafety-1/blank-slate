CREATE OR REPLACE FUNCTION public.is_message_sender(_message_id uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.internal_messages m
    WHERE m.id = _message_id AND m.sender_id = _user
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_message(_message_id uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.internal_messages m
    LEFT JOIN public.internal_message_recipients r ON r.message_id = m.id
    WHERE m.id = _message_id
      AND (m.sender_id = _user OR m.recipient_id = _user OR r.recipient_id = _user)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_thread_participant(_thread_root uuid, _user uuid)
RETURNS boolean
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

DROP POLICY IF EXISTS "Users see own inbox and sent" ON public.internal_messages;
CREATE POLICY "Users see own inbox and sent"
ON public.internal_messages FOR SELECT
TO authenticated
USING (
  recipient_id = auth.uid()
  OR sender_id = auth.uid()
  OR public.can_access_message(id, auth.uid())
  OR public.is_thread_participant(COALESCE(thread_root_id, id), auth.uid())
);

DROP POLICY IF EXISTS "Recipients see own rows" ON public.internal_message_recipients;
CREATE POLICY "Recipients see own rows"
ON public.internal_message_recipients FOR SELECT
TO authenticated
USING (
  recipient_id = auth.uid()
  OR public.is_message_sender(message_id, auth.uid())
);