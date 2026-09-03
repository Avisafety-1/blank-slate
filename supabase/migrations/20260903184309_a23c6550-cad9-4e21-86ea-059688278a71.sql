ALTER TABLE public.maintenance_schedule_presets
  ALTER COLUMN company_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS is_global boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kategori text,
  ADD COLUMN IF NOT EXISTS modellfamilie text,
  ADD COLUMN IF NOT EXISTS kilde_url text,
  ADD COLUMN IF NOT EXISTS merknad text,
  ADD COLUMN IF NOT EXISTS sist_verifisert date;

CREATE OR REPLACE FUNCTION public.validate_maintenance_preset_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_global AND NEW.company_id IS NOT NULL THEN
    RAISE EXCEPTION 'Global maintenance presets must not have a company_id';
  END IF;
  IF NOT NEW.is_global AND NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'Company maintenance presets require a company_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_maintenance_preset_scope_trg ON public.maintenance_schedule_presets;
CREATE TRIGGER validate_maintenance_preset_scope_trg
BEFORE INSERT OR UPDATE ON public.maintenance_schedule_presets
FOR EACH ROW EXECUTE FUNCTION public.validate_maintenance_preset_scope();

CREATE UNIQUE INDEX IF NOT EXISTS maintenance_schedule_presets_global_navn_key
  ON public.maintenance_schedule_presets (navn) WHERE is_global;

DROP POLICY IF EXISTS "Users can view presets in visible companies" ON public.maintenance_schedule_presets;
CREATE POLICY "Users can view presets in visible companies"
ON public.maintenance_schedule_presets
FOR SELECT TO authenticated
USING (is_global OR company_id = ANY (get_user_visible_company_ids(auth.uid())));

DROP POLICY IF EXISTS "Users can insert presets in visible companies" ON public.maintenance_schedule_presets;
CREATE POLICY "Users can insert presets in visible companies"
ON public.maintenance_schedule_presets
FOR INSERT TO authenticated
WITH CHECK (NOT is_global AND company_id = ANY (get_user_visible_company_ids(auth.uid())));

DROP POLICY IF EXISTS "Users can update presets in visible companies" ON public.maintenance_schedule_presets;
CREATE POLICY "Users can update presets in visible companies"
ON public.maintenance_schedule_presets
FOR UPDATE TO authenticated
USING (NOT is_global AND company_id = ANY (get_user_visible_company_ids(auth.uid())))
WITH CHECK (NOT is_global AND company_id = ANY (get_user_visible_company_ids(auth.uid())));

DROP POLICY IF EXISTS "Users can delete presets in visible companies" ON public.maintenance_schedule_presets;
CREATE POLICY "Users can delete presets in visible companies"
ON public.maintenance_schedule_presets
FOR DELETE TO authenticated
USING (NOT is_global AND company_id = ANY (get_user_visible_company_ids(auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_schedule_presets TO authenticated;
GRANT ALL ON public.maintenance_schedule_presets TO service_role;