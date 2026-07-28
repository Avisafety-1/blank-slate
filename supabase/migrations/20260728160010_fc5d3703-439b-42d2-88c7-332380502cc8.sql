CREATE OR REPLACE FUNCTION public.can_see_message_recipients(_message_id uuid, _user uuid)
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
      AND (
        m.sender_id = _user
        OR (m.is_broadcast = false AND (m.recipient_id = _user OR r.recipient_id = _user))
      )
  );
$$;

DROP POLICY IF EXISTS "Recipients see own rows" ON public.internal_message_recipients;
CREATE POLICY "Recipients see own rows"
ON public.internal_message_recipients FOR SELECT
TO authenticated
USING (
  recipient_id = auth.uid()
  OR public.can_see_message_recipients(message_id, auth.uid())
);