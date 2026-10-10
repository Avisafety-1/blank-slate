ALTER TABLE public.audit_findings ADD COLUMN IF NOT EXISTS root_cause text NULL;

CREATE OR REPLACE FUNCTION public.is_audit_finding_responsible(_finding_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.audit_findings f
                 WHERE f.id = _finding_id AND f.responsible_user_id = auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION public.is_audit_finding_responsible(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_audit_finding_responsible(uuid) TO authenticated; -- brukes i policyene

-- audit_reviews_guard: uendret logikk, kun kodeprefiks
CREATE OR REPLACE FUNCTION public.audit_reviews_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  open_critical int; unassessed int; missing_reason int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'planned' THEN RAISE EXCEPTION 'AUDIT_DELETE_ONLY_PLANNED: Bare planlagte revisjoner kan slettes'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
    NEW.audited_company_id := COALESCE(NEW.audited_company_id, NEW.company_id);
    IF NEW.status = 'closed' THEN RAISE EXCEPTION 'AUDIT_CREATE_CLOSED: En revisjon kan ikke opprettes som lukket'; END IF;
    NEW.closed_at := NULL;
    RETURN NEW;
  END IF;
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN RAISE EXCEPTION 'AUDIT_OWNER_COMPANY_LOCKED: Selskapet som eier revisjonen kan ikke endres'; END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'AUDIT_CREATED_BY_LOCKED: Opprettet av kan ikke endres'; END IF;
  IF OLD.status = 'closed' THEN
    IF (to_jsonb(NEW) - ARRAY['status','reopen_reason','closed_at','updated_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','reopen_reason','closed_at','updated_at']) THEN
      RAISE EXCEPTION 'AUDIT_REVIEW_CLOSED: Revisjonen er lukket og kan ikke endres. Gjenåpne den først';
    END IF;
    IF NEW.status = 'closed' THEN
      NEW.reopen_reason := OLD.reopen_reason; NEW.closed_at := OLD.closed_at;
      RETURN NEW;
    END IF;
    IF auth.uid() IS NOT NULL AND NOT public.is_audit_owner_admin(OLD.id, NULL) THEN
      RAISE EXCEPTION 'AUDIT_REOPEN_ADMIN_ONLY: Bare administrator i selskapet som eier revisjonen kan gjenåpne den';
    END IF;
    IF length(btrim(COALESCE(NEW.reopen_reason, ''))) < 10 THEN
      RAISE EXCEPTION 'AUDIT_REOPEN_REASON_REQUIRED: Gjenåpning krever en begrunnelse på minst 10 tegn';
    END IF;
    NEW.closed_at := NULL;
    RETURN NEW;
  END IF;
  IF NEW.status = 'closed' THEN
    SELECT count(*) FILTER (WHERE i.result = 'unknown'),
           count(*) FILTER (WHERE i.result IN ('warn','fail') AND length(btrim(COALESCE(i.comment,''))) = 0)
      INTO unassessed, missing_reason
      FROM public.audit_checklist_items i JOIN public.audit_sections s ON s.id = i.section_id
      WHERE s.review_id = NEW.id;
    IF unassessed > 0 THEN
      RAISE EXCEPTION 'AUDIT_UNASSESSED_ITEMS:%: % punkter er ikke vurdert', unassessed, unassessed;
    END IF;
    IF missing_reason > 0 THEN
      RAISE EXCEPTION 'AUDIT_MISSING_REASON:%: % punkter med avvik mangler begrunnelse', missing_reason, missing_reason;
    END IF;
    SELECT count(*) INTO open_critical FROM public.audit_findings
      WHERE review_id = NEW.id AND severity = 'critical' AND status NOT IN ('verified','closed');
    IF open_critical > 0 AND length(btrim(COALESCE(NEW.override_reason, ''))) < 10 THEN
      RAISE EXCEPTION 'AUDIT_OPEN_CRITICAL:%: Revisjonen har % åpne kritiske funn. Oppgi en overstyringsbegrunnelse på minst 10 tegn', open_critical, open_critical;
    END IF;
    NEW.closed_at := now();
  ELSE
    NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END $function$;

-- audit_children_guard: uendret logikk, kun kodeprefiks
CREATE OR REPLACE FUNCTION public.audit_children_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  rid uuid; rstatus text;
BEGIN
  IF TG_TABLE_NAME = 'audit_sections' THEN
    rid := CASE WHEN TG_OP = 'DELETE' THEN OLD.review_id ELSE NEW.review_id END;
    IF TG_OP = 'UPDATE' AND NEW.review_id IS DISTINCT FROM OLD.review_id THEN
      RAISE EXCEPTION 'AUDIT_REVIEW_ID_LOCKED: review_id kan ikke endres';
    END IF;
  ELSE
    rid := public.audit_section_review_id(CASE WHEN TG_OP = 'DELETE' THEN OLD.section_id ELSE NEW.section_id END);
    IF TG_OP = 'UPDATE' AND NEW.section_id IS DISTINCT FROM OLD.section_id THEN
      RAISE EXCEPTION 'AUDIT_SECTION_ID_LOCKED: section_id kan ikke endres';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'AUDIT_COMPANY_LOCKED: company_id kan ikke endres';
  END IF;
  SELECT status INTO rstatus FROM public.audit_reviews WHERE id = rid;
  IF rstatus = 'closed' THEN
    RAISE EXCEPTION 'AUDIT_REVIEW_CLOSED: Revisjonen er lukket og kan ikke endres. Gjenåpne den først';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $function$;

-- audit_findings_guard: root_cause + kodeprefiks
CREATE OR REPLACE FUNCTION public.audit_findings_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  is_admin boolean; audited uuid; item_review uuid; is_self boolean; allowed text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
    NEW.self_verified := false;
    IF NEW.review_id IS NOT NULL THEN
      SELECT audited_company_id INTO audited FROM public.audit_reviews WHERE id = NEW.review_id;
      IF audited IS NULL THEN RAISE EXCEPTION 'AUDIT_REVIEW_NOT_FOUND: Revisjonen finnes ikke'; END IF;
      NEW.company_id := audited;
    END IF;
    IF NEW.checklist_item_id IS NOT NULL THEN
      SELECT s.review_id INTO item_review
        FROM public.audit_checklist_items i JOIN public.audit_sections s ON s.id = i.section_id
        WHERE i.id = NEW.checklist_item_id;
      IF item_review IS NULL OR item_review IS DISTINCT FROM NEW.review_id THEN
        RAISE EXCEPTION 'AUDIT_ITEM_WRONG_REVIEW: Sjekklistepunktet tilhører ikke denne revisjonen';
      END IF;
    END IF;
    IF NEW.status = 'verified' THEN
      NEW.verified_by := auth.uid(); NEW.verified_at := now();
    ELSE
      NEW.verified_by := NULL; NEW.verified_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN RAISE EXCEPTION 'AUDIT_COMPANY_LOCKED: company_id kan ikke endres'; END IF;
  IF NEW.review_id IS DISTINCT FROM OLD.review_id THEN RAISE EXCEPTION 'AUDIT_REVIEW_ID_LOCKED: review_id kan ikke endres'; END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'AUDIT_CREATED_BY_LOCKED: Opprettet av kan ikke endres'; END IF;
  IF NEW.checklist_item_id IS DISTINCT FROM OLD.checklist_item_id AND NEW.checklist_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'AUDIT_ITEM_LINK_LOCKED: Koblingen til sjekklistepunktet kan ikke endres';
  END IF;
  IF OLD.status = 'verified' AND NEW.status = 'verified'
     AND NEW.closure_comment IS DISTINCT FROM OLD.closure_comment THEN
    RAISE EXCEPTION 'AUDIT_CLOSURE_COMMENT_LOCKED: Begrunnelsen kan ikke endres etter verifisering. Gjenåpne funnet først';
  END IF;
  IF OLD.status = 'verified' AND NEW.status = 'verified'
     AND NEW.root_cause IS DISTINCT FROM OLD.root_cause THEN
    RAISE EXCEPTION 'AUDIT_ROOT_CAUSE_LOCKED: Årsaken kan ikke endres etter verifisering. Gjenåpne funnet først';
  END IF;

  is_admin := auth.uid() IS NULL OR public.is_audit_owner_admin(OLD.review_id, OLD.company_id);

  IF NOT is_admin THEN
    allowed := ARRAY['status','updated_at','verified_by','verified_at'];
    IF OLD.responsible_user_id = auth.uid() THEN allowed := allowed || 'root_cause'::text; END IF;
    IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
      RAISE EXCEPTION 'AUDIT_FINDING_RESPONSIBLE_LIMITED: Som ansvarlig kan du bare endre status og årsak på funnet';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status IN ('open','in_progress') AND NEW.status IN ('open','in_progress')) THEN
      RAISE EXCEPTION 'AUDIT_VERIFY_ADMIN_ONLY: Bare administrator kan verifisere eller lukke funn';
    END IF;
    NEW.verified_by := OLD.verified_by; NEW.verified_at := OLD.verified_at;
    NEW.self_verified := OLD.self_verified;
    RETURN NEW;
  END IF;

  IF NEW.status = 'verified' AND OLD.status IS DISTINCT FROM 'verified' THEN
    IF NEW.severity = 'info' AND length(btrim(COALESCE(NEW.closure_comment, ''))) < 10 THEN
      RAISE EXCEPTION 'AUDIT_OBSERVATION_REASON_REQUIRED: Oppgi hvorfor observasjonen lukkes';
    END IF;
    is_self := COALESCE(auth.uid() IS NOT NULL AND (
      NEW.responsible_user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.audit_actions a WHERE a.finding_id = OLD.id AND a.responsible_user_id = auth.uid())), false);
    IF is_self AND length(btrim(COALESCE(NEW.closure_comment, ''))) < 10 THEN
      RAISE EXCEPTION 'AUDIT_SELF_VERIFY_REASON_REQUIRED: Du er selv ansvarlig – oppgi begrunnelse for egenverifisering';
    END IF;
    NEW.self_verified := is_self;
    NEW.verified_by := auth.uid(); NEW.verified_at := now();
  ELSIF NEW.status IN ('open','in_progress') THEN
    NEW.verified_by := NULL; NEW.verified_at := NULL;
    NEW.self_verified := false;
  ELSE
    NEW.verified_by := OLD.verified_by; NEW.verified_at := OLD.verified_at;
    NEW.self_verified := OLD.self_verified;
  END IF;
  RETURN NEW;
END $function$;

-- audit_actions_guard: én regel per rolle + kodeprefiks
CREATE OR REPLACE FUNCTION public.audit_actions_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  fcompany uuid; fstatus text; fresp uuid;
  is_admin boolean; is_fresp boolean; is_aresp boolean; allowed text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF auth.uid() IS NULL OR public.is_audit_finding_owner_admin(OLD.finding_id) THEN RETURN OLD; END IF;
    IF NOT public.is_audit_finding_responsible(OLD.finding_id) THEN
      RAISE EXCEPTION 'AUDIT_ACTION_DELETE_FORBIDDEN: Bare administrator eller ansvarlig for funnet kan slette tiltak';
    END IF;
    IF OLD.status <> 'open' OR OLD.created_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'AUDIT_ACTION_DELETE_OWN_OPEN: Du kan bare slette åpne tiltak du selv har opprettet';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
    SELECT company_id, status, responsible_user_id INTO fcompany, fstatus, fresp
      FROM public.audit_findings WHERE id = NEW.finding_id;
    IF fcompany IS NULL THEN RAISE EXCEPTION 'AUDIT_FINDING_NOT_FOUND: Funnet finnes ikke'; END IF;
    NEW.company_id := fcompany;
    IF auth.uid() IS NOT NULL AND NOT public.is_audit_finding_owner_admin(NEW.finding_id) THEN
      IF fresp IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'AUDIT_ACTION_CREATE_FORBIDDEN: Bare administrator eller ansvarlig for funnet kan legge til tiltak';
      END IF;
      IF fstatus IN ('verified','closed') THEN
        RAISE EXCEPTION 'AUDIT_FINDING_CLOSED: Funnet er lukket – nye tiltak kan ikke legges til';
      END IF;
      NEW.status := 'open'; NEW.closed_by := NULL; NEW.closed_at := NULL;  -- klientverdier ignoreres
      RETURN NEW;
    END IF;
    IF NEW.status = 'closed' THEN
      NEW.closed_by := auth.uid(); NEW.closed_at := now();
    ELSE
      NEW.closed_by := NULL; NEW.closed_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN RAISE EXCEPTION 'AUDIT_COMPANY_LOCKED: company_id kan ikke endres'; END IF;
  IF NEW.finding_id IS DISTINCT FROM OLD.finding_id THEN RAISE EXCEPTION 'AUDIT_FINDING_ID_LOCKED: finding_id kan ikke endres'; END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'AUDIT_CREATED_BY_LOCKED: Opprettet av kan ikke endres'; END IF;

  is_admin := auth.uid() IS NULL OR public.is_audit_finding_owner_admin(OLD.finding_id);
  IF NOT is_admin THEN
    is_fresp := public.is_audit_finding_responsible(OLD.finding_id);
    is_aresp := OLD.responsible_user_id = auth.uid();
    allowed := ARRAY['updated_at','closed_at','closed_by'];
    IF is_aresp THEN allowed := allowed || ARRAY['status','comment']; END IF;
    IF is_fresp THEN
      IF OLD.status = 'closed' AND (
           NEW.description IS DISTINCT FROM OLD.description
        OR NEW.responsible_user_id IS DISTINCT FROM OLD.responsible_user_id
        OR NEW.deadline IS DISTINCT FROM OLD.deadline) THEN
        RAISE EXCEPTION 'AUDIT_ACTION_CLOSED_LOCKED: Lukkede tiltak kan ikke endres';
      END IF;
      allowed := allowed || ARRAY['description','responsible_user_id','deadline'];
    END IF;
    IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
      IF is_fresp THEN
        RAISE EXCEPTION 'AUDIT_ACTION_FINDING_OWNER_LIMITED: Som ansvarlig for funnet kan du endre beskrivelse, ansvarlig og frist på åpne tiltak';
      ELSE
        RAISE EXCEPTION 'AUDIT_ACTION_RESPONSIBLE_LIMITED: Som ansvarlig kan du bare endre status og kommentar på tiltaket';
      END IF;
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
END $function$;

DROP TRIGGER IF EXISTS trg_audit_actions_00_guard ON public.audit_actions;
CREATE TRIGGER trg_audit_actions_00_guard BEFORE INSERT OR UPDATE OR DELETE ON public.audit_actions
  FOR EACH ROW EXECUTE FUNCTION public.audit_actions_guard();

DROP POLICY IF EXISTS audit_actions_insert ON public.audit_actions;
CREATE POLICY audit_actions_insert ON public.audit_actions FOR INSERT TO authenticated
  WITH CHECK (public.is_audit_finding_owner_admin(finding_id)
    OR (public.is_audit_finding_responsible(finding_id)
        AND EXISTS (SELECT 1 FROM public.audit_findings f WHERE f.id = finding_id
                    AND f.status NOT IN ('verified','closed'))));
DROP POLICY IF EXISTS audit_actions_update ON public.audit_actions;
CREATE POLICY audit_actions_update ON public.audit_actions FOR UPDATE TO authenticated
  USING (public.is_audit_finding_owner_admin(finding_id) OR responsible_user_id = auth.uid()
         OR public.is_audit_finding_responsible(finding_id))
  WITH CHECK (public.is_audit_finding_owner_admin(finding_id) OR responsible_user_id = auth.uid()
         OR public.is_audit_finding_responsible(finding_id));
DROP POLICY IF EXISTS audit_actions_delete ON public.audit_actions;
CREATE POLICY audit_actions_delete ON public.audit_actions FOR DELETE TO authenticated
  USING (public.is_audit_finding_owner_admin(finding_id)
    OR (public.is_audit_finding_responsible(finding_id) AND status = 'open' AND created_by = auth.uid()));