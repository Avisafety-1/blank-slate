
-- 1) Thread columns
ALTER TABLE public.internal_messages
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.internal_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS thread_root_id UUID;

CREATE INDEX IF NOT EXISTS idx_internal_messages_thread_root ON public.internal_messages(thread_root_id);
CREATE INDEX IF NOT EXISTS idx_internal_messages_recipient_thread ON public.internal_messages(recipient_id, thread_root_id);
CREATE INDEX IF NOT EXISTS idx_internal_messages_sender_created ON public.internal_messages(sender_id, created_at DESC);

-- 2) Trigger to auto-populate thread_root_id
CREATE OR REPLACE FUNCTION public.set_internal_message_thread_root()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.thread_root_id IS NULL THEN
    IF NEW.parent_id IS NOT NULL THEN
      SELECT COALESCE(thread_root_id, id) INTO NEW.thread_root_id
      FROM public.internal_messages WHERE id = NEW.parent_id;
    END IF;
    IF NEW.thread_root_id IS NULL THEN
      NEW.thread_root_id := NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_internal_message_thread_root ON public.internal_messages;
CREATE TRIGGER trg_set_internal_message_thread_root
  BEFORE INSERT ON public.internal_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_internal_message_thread_root();

-- Backfill existing rows
UPDATE public.internal_messages SET thread_root_id = id WHERE thread_root_id IS NULL;

-- 3) INSERT RLS policy: allow users to send to visible hierarchy, superadmin anywhere, and replies to prior senders
DROP POLICY IF EXISTS "Users can send messages" ON public.internal_messages;
CREATE POLICY "Users can send messages"
ON public.internal_messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND (
    -- Superadmin can send to anyone
    public.has_role(auth.uid(), 'superadmin'::app_role)
    -- Recipient is in the sender's visible company hierarchy
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = internal_messages.recipient_id
        AND p.company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
    )
    -- Reply to a message where the current user was participant
    OR (
      parent_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.internal_messages parent
        WHERE parent.id = internal_messages.parent_id
          AND (parent.sender_id = auth.uid() OR parent.recipient_id = auth.uid())
      )
    )
  )
);

-- 4) RPC to search recipients
CREATE OR REPLACE FUNCTION public.search_message_recipients(_query TEXT)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  email TEXT,
  company_id UUID,
  company_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_super BOOLEAN;
  visible_ids UUID[];
  q TEXT := COALESCE(NULLIF(TRIM(_query), ''), '');
  pattern TEXT := '%' || q || '%';
BEGIN
  is_super := public.has_role(auth.uid(), 'superadmin'::app_role);

  IF is_super THEN
    RETURN QUERY
      SELECT p.id, p.full_name, p.email, p.company_id, c.name AS company_name
      FROM public.profiles p
      LEFT JOIN public.companies c ON c.id = p.company_id
      WHERE p.id <> auth.uid()
        AND (q = '' OR p.full_name ILIKE pattern OR p.email ILIKE pattern)
      ORDER BY p.full_name NULLS LAST
      LIMIT 30;
  ELSE
    visible_ids := public.get_user_visible_company_ids(auth.uid());
    RETURN QUERY
      SELECT p.id, p.full_name, p.email, p.company_id, c.name AS company_name
      FROM public.profiles p
      LEFT JOIN public.companies c ON c.id = p.company_id
      WHERE p.id <> auth.uid()
        AND p.company_id = ANY (visible_ids)
        AND (q = '' OR p.full_name ILIKE pattern OR p.email ILIKE pattern)
      ORDER BY p.full_name NULLS LAST
      LIMIT 30;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_message_recipients(TEXT) TO authenticated;
