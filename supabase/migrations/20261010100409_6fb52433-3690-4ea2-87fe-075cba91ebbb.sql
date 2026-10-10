CREATE OR REPLACE FUNCTION public.add_internal_message_recipient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.recipient_id IS NOT NULL THEN
    INSERT INTO public.internal_message_recipients (message_id, recipient_id, status, created_at)
    VALUES (NEW.id, NEW.recipient_id, 'unread', NEW.created_at)
    ON CONFLICT (message_id, recipient_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_internal_message_recipient() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_internal_messages_add_recipient
AFTER INSERT ON public.internal_messages
FOR EACH ROW EXECUTE FUNCTION public.add_internal_message_recipient();