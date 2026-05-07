
CREATE TABLE public.user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  target_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  inviter_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  registration_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  accepted_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX idx_user_invitations_email_target ON public.user_invitations (lower(email), target_company_id);
CREATE INDEX idx_user_invitations_target_pending ON public.user_invitations (target_company_id) WHERE accepted_at IS NULL;
CREATE INDEX idx_user_invitations_inviter ON public.user_invitations (invited_by);

ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

-- Helper to check if a user is an Avisafe superadmin
CREATE OR REPLACE FUNCTION public.is_avisafe_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    JOIN public.companies c ON c.id = p.company_id
    WHERE ur.user_id = _user_id
      AND ur.role = 'superadmin'
      AND c.navn ILIKE 'avisafe'
  );
$$;

-- RLS: Avisafe superadmins see all
CREATE POLICY "Avisafe superadmins can view all invitations"
ON public.user_invitations FOR SELECT
TO authenticated
USING (public.is_avisafe_superadmin(auth.uid()));

-- RLS: Admins in target company (or its parent) can see invitations
CREATE POLICY "Admins in target or parent company can view invitations"
ON public.user_invitations FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = auth.uid()
      AND ur.role IN ('administrator','superadmin')
      AND (
        p.company_id = target_company_id
        OR p.company_id = public.get_parent_company_id(target_company_id)
      )
  )
);

-- No INSERT/UPDATE/DELETE policies — only service role (edge functions) can write

-- Trigger: link invitation when new profile is created
CREATE OR REPLACE FUNCTION public.link_invitation_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NOT NULL AND NEW.company_id IS NOT NULL THEN
    UPDATE public.user_invitations
    SET accepted_at = now(),
        accepted_user_id = NEW.id
    WHERE id = (
      SELECT id FROM public.user_invitations
      WHERE lower(email) = lower(NEW.email)
        AND target_company_id = NEW.company_id
        AND accepted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_link_invitation_on_signup
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.link_invitation_on_signup();
