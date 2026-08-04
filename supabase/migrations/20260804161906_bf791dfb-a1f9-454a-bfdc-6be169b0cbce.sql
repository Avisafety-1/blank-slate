ALTER TABLE public.company_mission_types
ADD COLUMN IF NOT EXISTS default_evaluation_template_id uuid REFERENCES public.evaluation_templates(id) ON DELETE SET NULL;