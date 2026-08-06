ALTER TABLE public.document_folder_items ALTER COLUMN document_id DROP NOT NULL;
ALTER TABLE public.document_folder_items ADD COLUMN IF NOT EXISTS evaluation_template_id uuid REFERENCES public.evaluation_templates(id) ON DELETE CASCADE;
ALTER TABLE public.document_folder_items ADD CONSTRAINT document_folder_items_one_target CHECK (num_nonnulls(document_id, evaluation_template_id) = 1);
CREATE INDEX IF NOT EXISTS idx_document_folder_items_eval ON public.document_folder_items(evaluation_template_id);