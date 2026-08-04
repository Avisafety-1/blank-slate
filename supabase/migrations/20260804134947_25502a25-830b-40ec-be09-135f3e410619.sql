CREATE TABLE public.internal_message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.internal_messages(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  file_size bigint,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_internal_message_attachments_message ON public.internal_message_attachments(message_id);

GRANT SELECT, INSERT, DELETE ON public.internal_message_attachments TO authenticated;
GRANT ALL ON public.internal_message_attachments TO service_role;

ALTER TABLE public.internal_message_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Thread participants can view attachments"
ON public.internal_message_attachments FOR SELECT TO authenticated
USING (public.can_access_message(message_id, auth.uid()));

CREATE POLICY "Uploader can add attachments"
ON public.internal_message_attachments FOR INSERT TO authenticated
WITH CHECK (uploaded_by = auth.uid() AND public.can_access_message(message_id, auth.uid()));

CREATE POLICY "Uploader can delete attachments"
ON public.internal_message_attachments FOR DELETE TO authenticated
USING (uploaded_by = auth.uid());

-- Helper: can the current user access the storage object (path = <message_id>/<file>)
CREATE OR REPLACE FUNCTION public.can_access_message_attachment_path(_path text, _user uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _msg uuid;
BEGIN
  BEGIN
    _msg := (split_part(_path, '/', 1))::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  RETURN public.can_access_message(_msg, _user);
END;
$$;

CREATE POLICY "Thread participants can read message attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'message-attachments' AND public.can_access_message_attachment_path(name, auth.uid()));

CREATE POLICY "Thread participants can upload message attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'message-attachments' AND public.can_access_message_attachment_path(name, auth.uid()));

CREATE POLICY "Owners can delete message attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'message-attachments' AND owner = auth.uid());