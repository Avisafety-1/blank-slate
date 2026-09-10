ALTER TABLE public.company_mission_types
  ADD COLUMN IF NOT EXISTS default_document_ids uuid[] NOT NULL DEFAULT '{}';

UPDATE public.company_mission_types
SET default_document_ids = ARRAY[default_document_id]
WHERE default_document_id IS NOT NULL
  AND cardinality(default_document_ids) = 0;