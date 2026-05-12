
-- Trigger: når dji_sync_from_date endres på et morselskap, propager til alle barn rekursivt
CREATE OR REPLACE FUNCTION public.propagate_dji_sync_from_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.dji_sync_from_date IS DISTINCT FROM OLD.dji_sync_from_date THEN
    WITH RECURSIVE descendants AS (
      SELECT id FROM public.companies WHERE parent_company_id = NEW.id
      UNION ALL
      SELECT c.id FROM public.companies c
      JOIN descendants d ON c.parent_company_id = d.id
    )
    UPDATE public.companies
    SET dji_sync_from_date = NEW.dji_sync_from_date
    WHERE id IN (SELECT id FROM descendants)
      AND dji_sync_from_date IS DISTINCT FROM NEW.dji_sync_from_date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_dji_sync_from_date ON public.companies;
CREATE TRIGGER trg_propagate_dji_sync_from_date
AFTER UPDATE OF dji_sync_from_date ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.propagate_dji_sync_from_date();
