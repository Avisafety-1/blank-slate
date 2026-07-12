
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS default_language text NOT NULL DEFAULT 'no';

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_default_language_check;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_default_language_check
  CHECK (default_language IN ('no','en'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_meta_lang text;
  v_company_lang text;
  v_resolved_lang text;
BEGIN
  v_meta_lang := NULLIF(NEW.raw_user_meta_data->>'preferred_language', '');
  IF v_meta_lang IS NOT NULL AND v_meta_lang NOT IN ('no','en') THEN
    v_meta_lang := NULL;
  END IF;

  IF NEW.raw_user_meta_data->>'new_company_name' IS NOT NULL THEN
    INSERT INTO public.companies (navn, org_nummer, dji_flightlog_enabled, default_language)
    VALUES (
      NEW.raw_user_meta_data->>'new_company_name',
      NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'new_company_org_nr', '')), ''),
      true,
      COALESCE(v_meta_lang, 'no')
    )
    RETURNING id, default_language INTO v_company_id, v_company_lang;

    v_resolved_lang := COALESCE(v_meta_lang, v_company_lang, 'no');

    INSERT INTO public.profiles (id, full_name, company_id, email, approved, preferred_language)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), v_company_id, NEW.email, true, v_resolved_lang);

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'administrator')
    ON CONFLICT (user_id) DO UPDATE SET role = 'administrator';

  ELSIF NEW.raw_user_meta_data->>'company_id' IS NOT NULL THEN
    SELECT default_language INTO v_company_lang
    FROM public.companies
    WHERE id = (NEW.raw_user_meta_data->>'company_id')::uuid;

    v_resolved_lang := COALESCE(v_meta_lang, v_company_lang, 'no');

    INSERT INTO public.profiles (id, full_name, company_id, email, approved, preferred_language)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      (NEW.raw_user_meta_data->>'company_id')::uuid,
      NEW.email,
      false,
      v_resolved_lang
    );
  END IF;
  RETURN NEW;
END;
$function$;
