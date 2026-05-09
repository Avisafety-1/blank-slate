-- PT-7: Audit log for FlightHub2 credential changes
CREATE TABLE IF NOT EXISTS public.fh2_credential_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('save','clear','rotate')),
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fh2_credential_audit_company_created
  ON public.fh2_credential_audit (company_id, created_at DESC);

ALTER TABLE public.fh2_credential_audit ENABLE ROW LEVEL SECURITY;

-- Only admins of the company (or superadmins) can read audit log entries.
-- Inserts go through the edge function with the service role, so no insert policy is needed.
CREATE POLICY "Admins can view fh2 audit for their company"
ON public.fh2_credential_audit
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'superadmin')
  OR (
    public.has_role(auth.uid(), 'admin')
    AND company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  )
);