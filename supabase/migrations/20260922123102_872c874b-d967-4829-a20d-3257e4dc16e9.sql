CREATE OR REPLACE FUNCTION public.cleanup_document_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.drones
     SET operations_checklist_ids = array_remove(operations_checklist_ids, OLD.id::text)
   WHERE operations_checklist_ids @> ARRAY[OLD.id::text];

  UPDATE public.drones SET post_flight_checklist_id = NULL WHERE post_flight_checklist_id = OLD.id;
  UPDATE public.drones SET operations_checklist_id = NULL WHERE operations_checklist_id = OLD.id;
  UPDATE public.drones SET sjekkliste_id = NULL WHERE sjekkliste_id = OLD.id;

  UPDATE public.equipment SET sjekkliste_id = NULL WHERE sjekkliste_id = OLD.id;
  UPDATE public.maintenance_schedules SET sjekkliste_id = NULL WHERE sjekkliste_id = OLD.id;

  UPDATE public.missions
     SET checklist_ids = array_remove(checklist_ids, OLD.id)
   WHERE checklist_ids @> ARRAY[OLD.id];

  UPDATE public.missions
     SET checklist_completed_ids = array_remove(checklist_completed_ids, OLD.id)
   WHERE checklist_completed_ids @> ARRAY[OLD.id];

  UPDATE public.company_mission_types
     SET default_document_ids = array_remove(default_document_ids, OLD.id)
   WHERE default_document_ids @> ARRAY[OLD.id];

  UPDATE public.company_mission_types SET default_document_id = NULL WHERE default_document_id = OLD.id;

  UPDATE public.companies
     SET before_takeoff_checklist_ids = array_remove(before_takeoff_checklist_ids, OLD.id)
   WHERE before_takeoff_checklist_ids @> ARRAY[OLD.id];

  UPDATE public.companies SET before_takeoff_checklist_id = NULL WHERE before_takeoff_checklist_id = OLD.id;

  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_document_references() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS documents_cleanup_references ON public.documents;
CREATE TRIGGER documents_cleanup_references
AFTER DELETE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.cleanup_document_references();