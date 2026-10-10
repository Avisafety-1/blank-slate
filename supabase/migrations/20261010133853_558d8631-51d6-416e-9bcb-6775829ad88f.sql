ALTER TABLE public.audit_findings
  ADD COLUMN IF NOT EXISTS checklist_item_id uuid NULL
  REFERENCES public.audit_checklist_items(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS audit_findings_checklist_item_unique
  ON public.audit_findings (checklist_item_id) WHERE checklist_item_id IS NOT NULL;
ALTER TABLE public.audit_findings ADD COLUMN IF NOT EXISTS closure_comment text NULL;
ALTER TABLE public.audit_findings ADD COLUMN IF NOT EXISTS self_verified boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.audit_findings_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  is_admin boolean;
  audited uuid;
  item_review uuid;
  is_self boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
    NEW.self_verified := false;
    IF NEW.review_id IS NOT NULL THEN
      SELECT audited_company_id INTO audited FROM public.audit_reviews WHERE id = NEW.review_id;
      IF audited IS NULL THEN RAISE EXCEPTION 'Revisjonen finnes ikke'; END IF;
      NEW.company_id := audited;
    END IF;
    IF NEW.checklist_item_id IS NOT NULL THEN
      SELECT s.review_id INTO item_review
        FROM public.audit_checklist_items i JOIN public.audit_sections s ON s.id = i.section_id
        WHERE i.id = NEW.checklist_item_id;
      IF item_review IS NULL OR item_review IS DISTINCT FROM NEW.review_id THEN
        RAISE EXCEPTION 'Sjekklistepunktet tilhører ikke denne revisjonen';
      END IF;
    END IF;
    IF NEW.status = 'verified' THEN
      NEW.verified_by := auth.uid(); NEW.verified_at := now();
    ELSE
      NEW.verified_by := NULL; NEW.verified_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN RAISE EXCEPTION 'company_id kan ikke endres'; END IF;
  IF NEW.review_id IS DISTINCT FROM OLD.review_id THEN RAISE EXCEPTION 'review_id kan ikke endres'; END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'Opprettet av kan ikke endres'; END IF;
  IF NEW.checklist_item_id IS DISTINCT FROM OLD.checklist_item_id AND NEW.checklist_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'Koblingen til sjekklistepunktet kan ikke endres';
  END IF;
  IF OLD.status = 'verified' AND NEW.status = 'verified'
     AND NEW.closure_comment IS DISTINCT FROM OLD.closure_comment THEN
    RAISE EXCEPTION 'Begrunnelsen kan ikke endres etter verifisering. Gjenåpne funnet først';
  END IF;

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
    NEW.verified_by := OLD.verified_by; NEW.verified_at := OLD.verified_at;
    NEW.self_verified := OLD.self_verified;
    RETURN NEW;
  END IF;

  IF NEW.status = 'verified' AND OLD.status IS DISTINCT FROM 'verified' THEN
    IF NEW.severity = 'info' AND length(btrim(COALESCE(NEW.closure_comment, ''))) < 10 THEN
      RAISE EXCEPTION 'Oppgi hvorfor observasjonen lukkes';
    END IF;
    is_self := auth.uid() IS NOT NULL AND (
      NEW.responsible_user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.audit_actions a WHERE a.finding_id = OLD.id AND a.responsible_user_id = auth.uid()));
    IF is_self AND length(btrim(COALESCE(NEW.closure_comment, ''))) < 10 THEN
      RAISE EXCEPTION 'Du er selv ansvarlig – oppgi begrunnelse for egenverifisering';
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

CREATE OR REPLACE FUNCTION public.audit_item_start_review()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.result IS DISTINCT FROM OLD.result OR NEW.comment IS DISTINCT FROM OLD.comment THEN
    UPDATE public.audit_reviews r SET status = 'in_progress'
      FROM public.audit_sections s
      WHERE s.id = NEW.section_id AND r.id = s.review_id AND r.status = 'planned';
  END IF;
  RETURN NULL;
END $function$;
REVOKE EXECUTE ON FUNCTION public.audit_item_start_review() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS audit_item_start_review ON public.audit_checklist_items;
CREATE TRIGGER audit_item_start_review
  AFTER UPDATE OF result, comment ON public.audit_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_item_start_review();

CREATE OR REPLACE FUNCTION public.audit_reviews_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  open_critical int;
  unassessed int;
  missing_reason int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'planned' THEN RAISE EXCEPTION 'Bare planlagte revisjoner kan slettes'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
    NEW.audited_company_id := COALESCE(NEW.audited_company_id, NEW.company_id);
    IF NEW.status = 'closed' THEN RAISE EXCEPTION 'En revisjon kan ikke opprettes som lukket'; END IF;
    NEW.closed_at := NULL;
    RETURN NEW;
  END IF;
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN RAISE EXCEPTION 'Selskapet som eier revisjonen kan ikke endres'; END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'Opprettet av kan ikke endres'; END IF;
  IF OLD.status = 'closed' THEN
    IF (to_jsonb(NEW) - ARRAY['status','reopen_reason','closed_at','updated_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','reopen_reason','closed_at','updated_at']) THEN
      RAISE EXCEPTION 'Revisjonen er lukket og kan ikke endres. Gjenåpne den først';
    END IF;
    IF NEW.status = 'closed' THEN
      NEW.reopen_reason := OLD.reopen_reason; NEW.closed_at := OLD.closed_at;
      RETURN NEW;
    END IF;
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
    SELECT count(*) FILTER (WHERE i.result = 'unknown'),
           count(*) FILTER (WHERE i.result IN ('warn','fail') AND length(btrim(COALESCE(i.comment,''))) = 0)
      INTO unassessed, missing_reason
      FROM public.audit_checklist_items i JOIN public.audit_sections s ON s.id = i.section_id
      WHERE s.review_id = NEW.id;
    IF unassessed > 0 THEN RAISE EXCEPTION '% punkter er ikke vurdert', unassessed; END IF;
    IF missing_reason > 0 THEN RAISE EXCEPTION '% punkter med avvik mangler begrunnelse', missing_reason; END IF;
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
END $function$;