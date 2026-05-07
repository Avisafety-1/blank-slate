CREATE OR REPLACE FUNCTION public.create_default_email_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.email_settings (company_id, from_name, from_email, enabled)
  VALUES (NEW.id, 'AviSafe', 'noreply@avisafe.no', true)
  ON CONFLICT (company_id) DO NOTHING;
  RETURN NEW;
END;
$function$;