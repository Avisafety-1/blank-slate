CREATE TABLE public.internal_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.internal_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX idx_internal_message_reactions_message ON public.internal_message_reactions(message_id);

GRANT SELECT, INSERT, DELETE ON public.internal_message_reactions TO authenticated;
GRANT ALL ON public.internal_message_reactions TO service_role;

ALTER TABLE public.internal_message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view reactions"
ON public.internal_message_reactions FOR SELECT TO authenticated
USING (public.can_access_message(message_id, auth.uid()));

CREATE POLICY "Participants can add own reactions"
ON public.internal_message_reactions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND public.can_access_message(message_id, auth.uid()));

CREATE POLICY "Users can remove own reactions"
ON public.internal_message_reactions FOR DELETE TO authenticated
USING (auth.uid() = user_id);