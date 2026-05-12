
CREATE OR REPLACE FUNCTION public.inherit_dji_sync_from_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_date date;
BEGIN
  IF NEW.parent_company_id IS NOT NULL AND NEW.dji_sync_from_date IS NULL THEN
    SELECT dji_sync_from_date INTO parent_date
    FROM public.companies WHERE id = NEW.parent_company_id;
    IF parent_date IS NOT NULL THEN
      NEW.dji_sync_from_date := parent_date;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inherit_dji_sync_from_date ON public.companies;
CREATE TRIGGER trg_inherit_dji_sync_from_date
BEFORE INSERT ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.inherit_dji_sync_from_date();
