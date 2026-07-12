ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'no';

ALTER TABLE public.email_templates
  DROP CONSTRAINT IF EXISTS email_templates_language_check;
ALTER TABLE public.email_templates
  ADD CONSTRAINT email_templates_language_check CHECK (language IN ('no', 'en'));

ALTER TABLE public.email_templates
  DROP CONSTRAINT IF EXISTS email_templates_company_id_template_type_key;

ALTER TABLE public.email_templates
  DROP CONSTRAINT IF EXISTS email_templates_company_type_lang_unique;
ALTER TABLE public.email_templates
  ADD CONSTRAINT email_templates_company_type_lang_unique
  UNIQUE (company_id, template_type, language);