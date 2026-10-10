-- 1. Columns
ALTER TABLE public.audit_reviews ADD COLUMN IF NOT EXISTS audited_company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
UPDATE public.audit_reviews SET audited_company_id = company_id WHERE audited_company_id IS NULL;
ALTER TABLE public.audit_reviews ALTER COLUMN audited_company_id SET NOT NULL;
ALTER TABLE public.audit_reviews ADD COLUMN IF NOT EXISTS template_key text NOT NULL DEFAULT 'specific';
ALTER TABLE public.audit_reviews DROP CONSTRAINT IF EXISTS audit_reviews_template_key_check;
ALTER TABLE public.audit_reviews ADD CONSTRAINT audit_reviews_template_key_check CHECK (template_key IN ('open','specific','luc'));
ALTER TABLE public.audit_reviews ADD COLUMN IF NOT EXISTS reopen_reason text;
ALTER TABLE public.audit_checklist_items ADD COLUMN IF NOT EXISTS item_key text;
ALTER TABLE public.audit_checklist_items ADD COLUMN IF NOT EXISTS reference text;

-- 2. Helper functions (used by RLS)
CREATE OR REPLACE FUNCTION public.is_audit_admin_role()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'superadmin')
$$;

CREATE OR REPLACE FUNCTION public.can_view_audit_review(_review_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.audit_reviews r WHERE r.id = _review_id AND (
      public.has_role(auth.uid(),'superadmin')
      OR r.company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
      OR r.audited_company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
    ))
$$;

CREATE OR REPLACE FUNCTION public.is_audit_owner_admin(_review_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_audit_admin_role() AND CASE
    WHEN _review_id IS NOT NULL THEN EXISTS (
      SELECT 1 FROM public.audit_reviews r WHERE r.id = _review_id
        AND r.company_id = public.get_user_company_id(auth.uid())
        AND r.audited_company_id = ANY (public.get_user_visible_company_ids(auth.uid())))
    ELSE _company_id IS NOT NULL AND _company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
  END
$$;

CREATE OR REPLACE FUNCTION public.audit_section_review_id(_section_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT review_id FROM public.audit_sections WHERE id = _section_id
$$;

CREATE OR REPLACE FUNCTION public.can_view_audit_finding(_finding_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.audit_findings f WHERE f.id = _finding_id AND (
    public.has_role(auth.uid(),'superadmin')
    OR f.company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
    OR (f.review_id IS NOT NULL AND public.can_view_audit_review(f.review_id))))
$$;

CREATE OR REPLACE FUNCTION public.is_audit_finding_owner_admin(_finding_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.audit_findings f WHERE f.id = _finding_id
    AND public.is_audit_owner_admin(f.review_id, f.company_id))
$$;

REVOKE EXECUTE ON FUNCTION public.is_audit_admin_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_audit_review(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_audit_owner_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.audit_section_review_id(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_audit_finding(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_audit_finding_owner_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_audit_admin_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_audit_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_audit_owner_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_section_review_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_audit_finding(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_audit_finding_owner_admin(uuid) TO authenticated;

-- 3. Policies
DROP POLICY IF EXISTS audit_reviews_select ON public.audit_reviews;
DROP POLICY IF EXISTS audit_reviews_insert ON public.audit_reviews;
DROP POLICY IF EXISTS audit_reviews_update ON public.audit_reviews;
DROP POLICY IF EXISTS audit_reviews_delete ON public.audit_reviews;
DROP POLICY IF EXISTS audit_sections_all ON public.audit_sections;
DROP POLICY IF EXISTS audit_checklist_all ON public.audit_checklist_items;
DROP POLICY IF EXISTS audit_findings_all ON public.audit_findings;
DROP POLICY IF EXISTS audit_actions_all ON public.audit_actions;
DROP POLICY IF EXISTS audit_sections_select ON public.audit_sections;
DROP POLICY IF EXISTS audit_sections_write ON public.audit_sections;
DROP POLICY IF EXISTS audit_checklist_select ON public.audit_checklist_items;
DROP POLICY IF EXISTS audit_checklist_write ON public.audit_checklist_items;
DROP POLICY IF EXISTS audit_findings_select ON public.audit_findings;
DROP POLICY IF EXISTS audit_findings_insert ON public.audit_findings;
DROP POLICY IF EXISTS audit_findings_update ON public.audit_findings;
DROP POLICY IF EXISTS audit_findings_delete ON public.audit_findings;
DROP POLICY IF EXISTS audit_actions_select ON public.audit_actions;
DROP POLICY IF EXISTS audit_actions_insert ON public.audit_actions;
DROP POLICY IF EXISTS audit_actions_update ON public.audit_actions;
DROP POLICY IF EXISTS audit_actions_delete ON public.audit_actions;

CREATE POLICY audit_reviews_select ON public.audit_reviews FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'superadmin')
  OR company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
  OR audited_company_id = ANY (public.get_user_visible_company_ids(auth.uid())));
CREATE POLICY audit_reviews_insert ON public.audit_reviews FOR INSERT TO authenticated WITH CHECK (
  public.is_audit_admin_role() AND company_id = public.get_user_company_id(auth.uid())
  AND COALESCE(audited_company_id, company_id) = ANY (public.get_user_visible_company_ids(auth.uid())));
CREATE POLICY audit_reviews_update ON public.audit_reviews FOR UPDATE TO authenticated USING (
  public.is_audit_admin_role() AND company_id = public.get_user_company_id(auth.uid())
  AND audited_company_id = ANY (public.get_user_visible_company_ids(auth.uid())))
WITH CHECK (
  public.is_audit_admin_role() AND company_id = public.get_user_company_id(auth.uid())
  AND audited_company_id = ANY (public.get_user_visible_company_ids(auth.uid())));
CREATE POLICY audit_reviews_delete ON public.audit_reviews FOR DELETE TO authenticated USING (
  status = 'planned' AND public.is_audit_admin_role() AND company_id = public.get_user_company_id(auth.uid())
  AND audited_company_id = ANY (public.get_user_visible_company_ids(auth.uid())));

CREATE POLICY audit_sections_select ON public.audit_sections FOR SELECT TO authenticated USING (public.can_view_audit_review(review_id));
CREATE POLICY audit_sections_write ON public.audit_sections FOR ALL TO authenticated
  USING (public.is_audit_owner_admin(review_id, NULL)) WITH CHECK (public.is_audit_owner_admin(review_id, NULL));

CREATE POLICY audit_checklist_select ON public.audit_checklist_items FOR SELECT TO authenticated USING (public.can_view_audit_review(public.audit_section_review_id(section_id)));
CREATE POLICY audit_checklist_write ON public.audit_checklist_items FOR ALL TO authenticated
  USING (public.is_audit_owner_admin(public.audit_section_review_id(section_id), NULL))
  WITH CHECK (public.is_audit_owner_admin(public.audit_section_review_id(section_id), NULL));

CREATE POLICY audit_findings_select ON public.audit_findings FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'superadmin')
  OR company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
  OR (review_id IS NOT NULL AND public.can_view_audit_review(review_id)));
CREATE POLICY audit_findings_insert ON public.audit_findings FOR INSERT TO authenticated WITH CHECK (public.is_audit_owner_admin(review_id, company_id));
CREATE POLICY audit_findings_update ON public.audit_findings FOR UPDATE TO authenticated
  USING (public.is_audit_owner_admin(review_id, company_id) OR responsible_user_id = auth.uid())
  WITH CHECK (public.is_audit_owner_admin(review_id, company_id) OR responsible_user_id = auth.uid());
CREATE POLICY audit_findings_delete ON public.audit_findings FOR DELETE TO authenticated USING (public.is_audit_owner_admin(review_id, company_id));

CREATE POLICY audit_actions_select ON public.audit_actions FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'superadmin')
  OR company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
  OR public.can_view_audit_finding(finding_id));
CREATE POLICY audit_actions_insert ON public.audit_actions FOR INSERT TO authenticated WITH CHECK (public.is_audit_finding_owner_admin(finding_id));
CREATE POLICY audit_actions_update ON public.audit_actions FOR UPDATE TO authenticated
  USING (public.is_audit_finding_owner_admin(finding_id) OR responsible_user_id = auth.uid())
  WITH CHECK (public.is_audit_finding_owner_admin(finding_id) OR responsible_user_id = auth.uid());
CREATE POLICY audit_actions_delete ON public.audit_actions FOR DELETE TO authenticated USING (public.is_audit_finding_owner_admin(finding_id));

-- 4. Trigger functions
CREATE OR REPLACE FUNCTION public.audit_reviews_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  open_critical int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'planned' THEN
      RAISE EXCEPTION 'Bare planlagte revisjoner kan slettes';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
    NEW.audited_company_id := COALESCE(NEW.audited_company_id, NEW.company_id);
    IF NEW.status = 'closed' THEN
      RAISE EXCEPTION 'En revisjon kan ikke opprettes som lukket';
    END IF;
    NEW.closed_at := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Selskapet som eier revisjonen kan ikke endres';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Opprettet av kan ikke endres';
  END IF;

  IF OLD.status = 'closed' THEN
    IF (to_jsonb(NEW) - ARRAY['status','reopen_reason','closed_at','updated_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','reopen_reason','closed_at','updated_at']) THEN
      RAISE EXCEPTION 'Revisjonen er lukket og kan ikke endres. Gjenåpne den først';
    END IF;
    IF NEW.status = 'closed' THEN
      NEW.reopen_reason := OLD.reopen_reason;
      NEW.closed_at := OLD.closed_at;
      RETURN NEW;
    END IF;
    -- reopening
    IF auth.uid() IS NOT NULL AND NOT public.is_audit_owner_admin(OLD.id, NULL) THEN
      RAISE EXCEPTION 'Bare administrator i selskapet som eier revisjonen kan gjenåpne den';
    END IF;
    IF length(btrim(COALESCE(NEW.reopen_reason, ''))) < 10 THEN
      RAISE EXCEPTION 'Gjenåpning krever en begrunnelse på minst 10 tegn';
    END IF;
    NEW.closed_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.status = 'closed' THEN
    SELECT count(*) INTO open_critical FROM public.audit_findings
      WHERE review_id = NEW.id AND severity = 'critical' AND status NOT IN ('verified','closed');
    IF open_critical > 0 AND length(btrim(COALESCE(NEW.override_reason, ''))) < 10 THEN
      RAISE EXCEPTION 'Revisjonen har % åpne kritiske funn. Oppgi en overstyringsbegrunnelse på minst 10 tegn', open_critical;
    END IF;
    NEW.closed_at := now();
  ELSE
    NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.audit_children_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rid uuid;
  rstatus text;
BEGIN
  IF TG_TABLE_NAME = 'audit_sections' THEN
    rid := CASE WHEN TG_OP = 'DELETE' THEN OLD.review_id ELSE NEW.review_id END;
    IF TG_OP = 'UPDATE' AND NEW.review_id IS DISTINCT FROM OLD.review_id THEN
      RAISE EXCEPTION 'review_id kan ikke endres';
    END IF;
  ELSE
    rid := public.audit_section_review_id(CASE WHEN TG_OP = 'DELETE' THEN OLD.section_id ELSE NEW.section_id END);
    IF TG_OP = 'UPDATE' AND NEW.section_id IS DISTINCT FROM OLD.section_id THEN
      RAISE EXCEPTION 'section_id kan ikke endres';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'company_id kan ikke endres';
  END IF;
  SELECT status INTO rstatus FROM public.audit_reviews WHERE id = rid;
  IF rstatus = 'closed' THEN
    RAISE EXCEPTION 'Revisjonen er lukket og kan ikke endres. Gjenåpne den først';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.audit_findings_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_admin boolean;
  audited uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
    IF NEW.review_id IS NOT NULL THEN
      SELECT audited_company_id INTO audited FROM public.audit_reviews WHERE id = NEW.review_id;
      IF audited IS NULL THEN RAISE EXCEPTION 'Revisjonen finnes ikke'; END IF;
      NEW.company_id := audited;
    END IF;
    IF NEW.status = 'verified' THEN
      NEW.verified_by := auth.uid();
      NEW.verified_at := now();
    ELSE
      NEW.verified_by := NULL;
      NEW.verified_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN RAISE EXCEPTION 'company_id kan ikke endres'; END IF;
  IF NEW.review_id IS DISTINCT FROM OLD.review_id THEN RAISE EXCEPTION 'review_id kan ikke endres'; END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'Opprettet av kan ikke endres'; END IF;

  is_admin := auth.uid() IS NULL OR public.is_audit_owner_admin(OLD.review_id, OLD.company_id);

  IF NOT is_admin THEN
    IF (to_jsonb(NEW) - ARRAY['status','updated_at','verified_by','verified_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','updated_at','verified_by','verified_at']) THEN
      RAISE EXCEPTION 'Som ansvarlig kan du bare endre status på funnet';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status IN ('open','in_progress') AND NEW.status IN ('open','in_progress')) THEN
      RAISE EXCEPTION 'Bare administrator kan verifisere eller lukke funn';
    END IF;
    NEW.verified_by := OLD.verified_by;
    NEW.verified_at := OLD.verified_at;
    RETURN NEW;
  END IF;

  IF NEW.status = 'verified' AND OLD.status IS DISTINCT FROM 'verified' THEN
    IF auth.uid() IS NOT NULL AND (
      NEW.responsible_user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.audit_actions a WHERE a.finding_id = OLD.id AND a.responsible_user_id = auth.uid())) THEN
      RAISE EXCEPTION 'Du kan ikke verifisere et funn der du selv er ansvarlig for funnet eller et tiltak';
    END IF;
    NEW.verified_by := auth.uid();
    NEW.verified_at := now();
  ELSIF NEW.status IN ('open','in_progress') THEN
    NEW.verified_by := NULL;
    NEW.verified_at := NULL;
  ELSE
    NEW.verified_by := OLD.verified_by;
    NEW.verified_at := OLD.verified_at;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.audit_actions_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  fcompany uuid;
  is_admin boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
    SELECT company_id INTO fcompany FROM public.audit_findings WHERE id = NEW.finding_id;
    IF fcompany IS NULL THEN RAISE EXCEPTION 'Funnet finnes ikke'; END IF;
    NEW.company_id := fcompany;
    IF NEW.status = 'closed' THEN
      NEW.closed_by := auth.uid(); NEW.closed_at := now();
    ELSE
      NEW.closed_by := NULL; NEW.closed_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN RAISE EXCEPTION 'company_id kan ikke endres'; END IF;
  IF NEW.finding_id IS DISTINCT FROM OLD.finding_id THEN RAISE EXCEPTION 'finding_id kan ikke endres'; END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'Opprettet av kan ikke endres'; END IF;

  is_admin := auth.uid() IS NULL OR public.is_audit_finding_owner_admin(OLD.finding_id);
  IF NOT is_admin THEN
    IF (to_jsonb(NEW) - ARRAY['status','comment','updated_at','closed_at','closed_by'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','comment','updated_at','closed_at','closed_by']) THEN
      RAISE EXCEPTION 'Som ansvarlig kan du bare endre status og kommentar på tiltaket';
    END IF;
  END IF;

  IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
    NEW.closed_by := auth.uid(); NEW.closed_at := now();
  ELSIF NEW.status <> 'closed' THEN
    NEW.closed_by := NULL; NEW.closed_at := NULL;
  ELSE
    NEW.closed_by := OLD.closed_by; NEW.closed_at := OLD.closed_at;
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.audit_reviews_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_children_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_findings_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_actions_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_reviews_00_guard ON public.audit_reviews;
CREATE TRIGGER trg_audit_reviews_00_guard BEFORE INSERT OR UPDATE OR DELETE ON public.audit_reviews FOR EACH ROW EXECUTE FUNCTION public.audit_reviews_guard();
DROP TRIGGER IF EXISTS trg_audit_sections_00_guard ON public.audit_sections;
CREATE TRIGGER trg_audit_sections_00_guard BEFORE INSERT OR UPDATE OR DELETE ON public.audit_sections FOR EACH ROW EXECUTE FUNCTION public.audit_children_guard();
DROP TRIGGER IF EXISTS trg_audit_checklist_00_guard ON public.audit_checklist_items;
CREATE TRIGGER trg_audit_checklist_00_guard BEFORE INSERT OR UPDATE OR DELETE ON public.audit_checklist_items FOR EACH ROW EXECUTE FUNCTION public.audit_children_guard();
DROP TRIGGER IF EXISTS trg_audit_findings_00_guard ON public.audit_findings;
CREATE TRIGGER trg_audit_findings_00_guard BEFORE INSERT OR UPDATE ON public.audit_findings FOR EACH ROW EXECUTE FUNCTION public.audit_findings_guard();
DROP TRIGGER IF EXISTS trg_audit_actions_00_guard ON public.audit_actions;
CREATE TRIGGER trg_audit_actions_00_guard BEFORE INSERT OR UPDATE ON public.audit_actions FOR EACH ROW EXECUTE FUNCTION public.audit_actions_guard();

-- 5. Atomic creation RPC (runs as caller, RLS applies)
CREATE OR REPLACE FUNCTION public.create_internal_audit(
  _title text, _review_date date, _responsible_user_id uuid, _template_key text,
  _audited_company_id uuid, _sections jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  owner uuid := public.get_user_company_id(auth.uid());
  rid uuid;
  sid uuid;
  s jsonb;
  it jsonb;
  si int := 0;
  ii int;
BEGIN
  INSERT INTO public.audit_reviews (company_id, audited_company_id, title, review_type, review_date, responsible_user_id, template_key, status)
  VALUES (owner, COALESCE(_audited_company_id, owner), _title, 'internal', _review_date, _responsible_user_id, _template_key, 'planned')
  RETURNING id INTO rid;
  FOR s IN SELECT * FROM jsonb_array_elements(COALESCE(_sections, '[]'::jsonb)) LOOP
    INSERT INTO public.audit_sections (review_id, company_id, section_key, status, order_index)
    VALUES (rid, owner, s->>'key', 'info', si) RETURNING id INTO sid;
    ii := 0;
    FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(s->'items', '[]'::jsonb)) LOOP
      INSERT INTO public.audit_checklist_items (section_id, company_id, item_key, label, reference, result, order_index)
      VALUES (sid, owner, it->>'key', it->>'label', it->>'reference', 'unknown', ii);
      ii := ii + 1;
    END LOOP;
    si := si + 1;
  END LOOP;
  RETURN rid;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_internal_audit(text, date, uuid, text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_internal_audit(text, date, uuid, text, uuid, jsonb) TO authenticated;