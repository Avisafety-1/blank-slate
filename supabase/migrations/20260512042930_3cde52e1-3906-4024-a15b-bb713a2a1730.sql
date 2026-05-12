
CREATE OR REPLACE FUNCTION public.sync_dji_credential_company_on_profile_move()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only re-pin when company actually changed AND the change was made by someone
  -- other than the user themselves (i.e. an admin moving the user).
  -- auth.uid() may be NULL in service-role contexts; treat that as a system move
  -- and propagate the change too.
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
     AND (auth.uid() IS NULL OR auth.uid() <> NEW.id)
  THEN
    UPDATE public.dji_credentials
       SET company_id = NEW.company_id,
           updated_at = now()
     WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_dji_credential_company ON public.profiles;
CREATE TRIGGER trg_sync_dji_credential_company
AFTER UPDATE OF company_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_dji_credential_company_on_profile_move();
