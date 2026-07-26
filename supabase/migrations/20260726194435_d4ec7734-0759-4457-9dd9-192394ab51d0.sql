
-- ============================================================
-- Compliance & Audit – Fase B: tabeller
-- ============================================================

-- ---------- audit_reviews ----------
CREATE TABLE public.audit_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  review_type text NOT NULL DEFAULT 'internal',
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_date date NOT NULL DEFAULT (now()::date),
  responsible_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','closed')),
  closed_at timestamptz,
  override_reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_reviews_company ON public.audit_reviews(company_id);
CREATE INDEX idx_audit_reviews_status ON public.audit_reviews(company_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_reviews TO authenticated;
GRANT ALL ON public.audit_reviews TO service_role;
ALTER TABLE public.audit_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_reviews_select ON public.audit_reviews
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin'::app_role)
    OR company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  );
CREATE POLICY audit_reviews_insert ON public.audit_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'superadmin'::app_role)
    OR company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  );
CREATE POLICY audit_reviews_update ON public.audit_reviews
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin'::app_role)
    OR company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  );
CREATE POLICY audit_reviews_delete ON public.audit_reviews
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin'::app_role)
    OR company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  );

-- ---------- audit_sections ----------
CREATE TABLE public.audit_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.audit_reviews(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  comment text,
  status text NOT NULL DEFAULT 'info' CHECK (status IN ('ok','warning','danger','info')),
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_sections_review ON public.audit_sections(review_id);
CREATE INDEX idx_audit_sections_company ON public.audit_sections(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_sections TO authenticated;
GRANT ALL ON public.audit_sections TO service_role;
ALTER TABLE public.audit_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_sections_all ON public.audit_sections
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin'::app_role)
    OR company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'superadmin'::app_role)
    OR company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  );

-- ---------- audit_checklist_items ----------
CREATE TABLE public.audit_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.audit_sections(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  label text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  result text NOT NULL DEFAULT 'unknown' CHECK (result IN ('pass','warn','fail','na','unknown')),
  comment text,
  evidence_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_checklist_section ON public.audit_checklist_items(section_id);
CREATE INDEX idx_audit_checklist_company ON public.audit_checklist_items(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_checklist_items TO authenticated;
GRANT ALL ON public.audit_checklist_items TO service_role;
ALTER TABLE public.audit_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_checklist_all ON public.audit_checklist_items
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin'::app_role)
    OR company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'superadmin'::app_role)
    OR company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  );

-- ---------- audit_findings ----------
CREATE TABLE public.audit_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  review_id uuid REFERENCES public.audit_reviews(id) ON DELETE SET NULL,
  source_scanner_code text,
  category text NOT NULL,
  description text NOT NULL,
  reference text,
  responsible_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deadline date,
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('critical','warning','info')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','verified','closed')),
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_findings_company ON public.audit_findings(company_id);
CREATE INDEX idx_audit_findings_review ON public.audit_findings(review_id);
CREATE INDEX idx_audit_findings_status ON public.audit_findings(company_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_findings TO authenticated;
GRANT ALL ON public.audit_findings TO service_role;
ALTER TABLE public.audit_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_findings_all ON public.audit_findings
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin'::app_role)
    OR company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'superadmin'::app_role)
    OR company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  );

-- ---------- audit_actions ----------
CREATE TABLE public.audit_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id uuid NOT NULL REFERENCES public.audit_findings(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  description text NOT NULL,
  responsible_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deadline date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','closed')),
  comment text,
  closed_at timestamptz,
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_actions_finding ON public.audit_actions(finding_id);
CREATE INDEX idx_audit_actions_company ON public.audit_actions(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_actions TO authenticated;
GRANT ALL ON public.audit_actions TO service_role;
ALTER TABLE public.audit_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_actions_all ON public.audit_actions
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin'::app_role)
    OR company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'superadmin'::app_role)
    OR company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  );

-- ---------- audit_attachments ----------
CREATE TABLE public.audit_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  parent_type text NOT NULL CHECK (parent_type IN ('review','finding','action','checklist_item')),
  parent_id uuid NOT NULL,
  storage_path text NOT NULL,
  filename text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_attachments_parent ON public.audit_attachments(parent_type, parent_id);
CREATE INDEX idx_audit_attachments_company ON public.audit_attachments(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_attachments TO authenticated;
GRANT ALL ON public.audit_attachments TO service_role;
ALTER TABLE public.audit_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_attachments_all ON public.audit_attachments
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin'::app_role)
    OR company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'superadmin'::app_role)
    OR company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  );

-- ---------- compliance_finding_dispositions ----------
CREATE TABLE public.compliance_finding_dispositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  finding_code text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  disposition text NOT NULL CHECK (disposition IN ('accepted','dismissed','snoozed')),
  reason text,
  snooze_until date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, finding_code, entity_type, entity_id)
);
CREATE INDEX idx_disp_company ON public.compliance_finding_dispositions(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_finding_dispositions TO authenticated;
GRANT ALL ON public.compliance_finding_dispositions TO service_role;
ALTER TABLE public.compliance_finding_dispositions ENABLE ROW LEVEL SECURITY;

CREATE POLICY disp_all ON public.compliance_finding_dispositions
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin'::app_role)
    OR company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'superadmin'::app_role)
    OR company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  );

-- ---------- updated_at triggers ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'audit_reviews','audit_sections','audit_checklist_items',
    'audit_findings','audit_actions','compliance_finding_dispositions'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      t
    );
  END LOOP;
END $$;

-- ---------- Company-consistency trigger for child rows ----------
CREATE OR REPLACE FUNCTION public.audit_enforce_child_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_company uuid;
BEGIN
  IF TG_TABLE_NAME = 'audit_sections' THEN
    SELECT company_id INTO parent_company FROM public.audit_reviews WHERE id = NEW.review_id;
  ELSIF TG_TABLE_NAME = 'audit_checklist_items' THEN
    SELECT company_id INTO parent_company FROM public.audit_sections WHERE id = NEW.section_id;
  ELSIF TG_TABLE_NAME = 'audit_actions' THEN
    SELECT company_id INTO parent_company FROM public.audit_findings WHERE id = NEW.finding_id;
  END IF;
  IF parent_company IS NOT NULL AND parent_company <> NEW.company_id THEN
    RAISE EXCEPTION 'company_id mismatch with parent row';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_audit_sections_company BEFORE INSERT OR UPDATE ON public.audit_sections
  FOR EACH ROW EXECUTE FUNCTION public.audit_enforce_child_company();
CREATE TRIGGER trg_audit_checklist_company BEFORE INSERT OR UPDATE ON public.audit_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_enforce_child_company();
CREATE TRIGGER trg_audit_actions_company BEFORE INSERT OR UPDATE ON public.audit_actions
  FOR EACH ROW EXECUTE FUNCTION public.audit_enforce_child_company();
