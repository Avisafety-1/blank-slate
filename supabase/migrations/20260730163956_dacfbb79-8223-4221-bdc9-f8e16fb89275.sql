CREATE OR REPLACE FUNCTION public.get_message_parties(_ids uuid[])
RETURNS TABLE(id uuid, full_name text, email text, company_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.email, c.navn AS company_name
  FROM public.profiles p
  LEFT JOIN public.companies c ON c.id = p.company_id
  WHERE p.id = ANY(_ids)
    AND (
      p.id = auth.uid()
      OR p.company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
      OR EXISTS (
        SELECT 1
        FROM public.internal_messages m
        LEFT JOIN public.internal_message_recipients r ON r.message_id = m.id
        WHERE (m.sender_id = auth.uid() OR m.recipient_id = auth.uid() OR r.recipient_id = auth.uid())
          AND (m.sender_id = p.id OR m.recipient_id = p.id OR r.recipient_id = p.id)
      )
    );
$$;

REVOKE ALL ON FUNCTION public.get_message_parties(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_message_parties(uuid[]) TO authenticated;