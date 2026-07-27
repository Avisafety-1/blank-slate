
CREATE TABLE public.inspection_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  generated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  period_from date,
  period_to date,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  overall_score integer,
  storage_path text NOT NULL,
  file_size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_packages TO authenticated;
GRANT ALL ON public.inspection_packages TO service_role;

ALTER TABLE public.inspection_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view inspection packages in their hierarchy"
  ON public.inspection_packages FOR SELECT
  TO authenticated
  USING (
    company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
    AND (
      public.has_role(auth.uid(), 'administrator'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'superadmin'::app_role)
    )
  );

CREATE POLICY "Admins can create inspection packages in their hierarchy"
  ON public.inspection_packages FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
    AND (
      public.has_role(auth.uid(), 'administrator'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'superadmin'::app_role)
    )
    AND generated_by = auth.uid()
  );

CREATE POLICY "Admins can delete inspection packages in their hierarchy"
  ON public.inspection_packages FOR DELETE
  TO authenticated
  USING (
    company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
    AND (
      public.has_role(auth.uid(), 'administrator'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'superadmin'::app_role)
    )
  );

CREATE INDEX idx_inspection_packages_company_generated
  ON public.inspection_packages (company_id, generated_at DESC);
