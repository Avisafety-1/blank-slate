ALTER TABLE public.drone_models
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS airframe_category text;

CREATE INDEX IF NOT EXISTS idx_drone_models_company_id ON public.drone_models(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.drone_models TO authenticated;
GRANT ALL ON public.drone_models TO service_role;

ALTER TABLE public.drone_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read drone models" ON public.drone_models;

CREATE POLICY "Read global and own company drone models"
ON public.drone_models FOR SELECT TO authenticated
USING (
  company_id IS NULL
  OR company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
);

CREATE POLICY "Insert own company drone models"
ON public.drone_models FOR INSERT TO authenticated
WITH CHECK (
  company_id IS NOT NULL
  AND company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
);

CREATE POLICY "Update own company drone models"
ON public.drone_models FOR UPDATE TO authenticated
USING (
  company_id IS NOT NULL
  AND company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
)
WITH CHECK (
  company_id IS NOT NULL
  AND company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
);

CREATE POLICY "Delete own company drone models"
ON public.drone_models FOR DELETE TO authenticated
USING (
  company_id IS NOT NULL
  AND company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
);