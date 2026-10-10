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
    is_self := COALESCE(auth.uid() IS NOT NULL AND (
      NEW.responsible_user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.audit_actions a WHERE a.finding_id = OLD.id AND a.responsible_user_id = auth.uid())), false);
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