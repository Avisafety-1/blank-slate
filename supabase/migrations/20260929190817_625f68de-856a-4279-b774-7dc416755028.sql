ALTER TABLE public.company_mission_types ADD COLUMN sora_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL;
ALTER TABLE public.missions ADD COLUMN sora_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.company_mission_types.sora_document_id IS 'Existing PDF document designated as SORA for this mission type; inherited with the type.';
COMMENT ON COLUMN public.missions.sora_document_id IS 'SORA document selected for this mission, independent of the per-mission SORA analysis.';