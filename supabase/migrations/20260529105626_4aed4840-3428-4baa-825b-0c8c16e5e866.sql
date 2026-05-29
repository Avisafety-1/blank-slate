ALTER TABLE public.company_mission_types
ADD COLUMN default_document_id uuid NULL REFERENCES public.documents(id) ON DELETE SET NULL;