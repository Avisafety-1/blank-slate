CREATE TABLE public.evaluation_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  structure JSONB NOT NULL DEFAULT '[]'::jsonb,
  global_visibility BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.evaluation_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.evaluation_templates(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  mission_id UUID REFERENCES public.missions(id) ON DELETE SET NULL,
  instructor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  instructor_name TEXT,
  student_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  student_name TEXT,
  mission_name TEXT,
  mission_start TIMESTAMP WITH TIME ZONE,
  mission_end TIMESTAMP WITH TIME ZONE,
  evaluated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  overall_comment TEXT,
  overall_average NUMERIC,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_evaluation_templates_company ON public.evaluation_templates(company_id);
CREATE INDEX idx_evaluation_responses_template ON public.evaluation_responses(template_id);
CREATE INDEX idx_evaluation_responses_company ON public.evaluation_responses(company_id);
CREATE INDEX idx_evaluation_responses_mission ON public.evaluation_responses(mission_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluation_templates TO authenticated;
GRANT ALL ON public.evaluation_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluation_responses TO authenticated;
GRANT ALL ON public.evaluation_responses TO service_role;

ALTER TABLE public.evaluation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view evaluation templates in visible companies"
ON public.evaluation_templates FOR SELECT TO authenticated
USING (
  global_visibility = true
  OR company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
);

CREATE POLICY "Admins can insert evaluation templates"
ON public.evaluation_templates FOR INSERT TO authenticated
WITH CHECK (
  company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'superadmin'::public.app_role))
);

CREATE POLICY "Admins can update evaluation templates"
ON public.evaluation_templates FOR UPDATE TO authenticated
USING (
  company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'superadmin'::public.app_role))
)
WITH CHECK (
  company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'superadmin'::public.app_role))
);

CREATE POLICY "Admins can delete evaluation templates"
ON public.evaluation_templates FOR DELETE TO authenticated
USING (
  company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'superadmin'::public.app_role))
);

CREATE POLICY "Users can view evaluation responses in visible companies"
ON public.evaluation_responses FOR SELECT TO authenticated
USING (company_id = ANY(public.get_user_visible_company_ids(auth.uid())));

CREATE POLICY "Users can insert evaluation responses"
ON public.evaluation_responses FOR INSERT TO authenticated
WITH CHECK (company_id = ANY(public.get_user_visible_company_ids(auth.uid())) AND created_by = auth.uid());

CREATE POLICY "Users can update own evaluation responses"
ON public.evaluation_responses FOR UPDATE TO authenticated
USING (
  company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'superadmin'::public.app_role))
)
WITH CHECK (company_id = ANY(public.get_user_visible_company_ids(auth.uid())));

CREATE POLICY "Admins can delete evaluation responses"
ON public.evaluation_responses FOR DELETE TO authenticated
USING (
  company_id = ANY(public.get_user_visible_company_ids(auth.uid()))
  AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'superadmin'::public.app_role))
);

CREATE TRIGGER update_evaluation_templates_updated_at
BEFORE UPDATE ON public.evaluation_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_evaluation_responses_updated_at
BEFORE UPDATE ON public.evaluation_responses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();