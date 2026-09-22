ALTER TABLE public.drone_models
  ADD COLUMN IF NOT EXISTS ip_rating text,
  ADD COLUMN IF NOT EXISTS ip_source_status text NOT NULL DEFAULT 'not_documented',
  ADD COLUMN IF NOT EXISTS ip_source_url text,
  ADD COLUMN IF NOT EXISTS ip_source_checked_at date,
  ADD COLUMN IF NOT EXISTS ip_manufacturer_limitation_no text,
  ADD COLUMN IF NOT EXISTS ip_manufacturer_limitation_en text;

GRANT SELECT ON public.drone_models TO authenticated;
GRANT ALL ON public.drone_models TO service_role;

COMMENT ON COLUMN public.drone_models.ip_rating IS 'Manufacturer-published whole-aircraft ingress protection rating';
COMMENT ON COLUMN public.drone_models.ip_source_status IS 'documented or not_documented; only primary manufacturer evidence qualifies';
COMMENT ON COLUMN public.drone_models.ip_source_url IS 'Primary manufacturer specification, manual, or FAQ URL';
COMMENT ON COLUMN public.drone_models.ip_source_checked_at IS 'Date the primary source was last verified';
COMMENT ON COLUMN public.drone_models.ip_manufacturer_limitation_no IS 'Norwegian rendering of explicit manufacturer precipitation or coverage limitation';
COMMENT ON COLUMN public.drone_models.ip_manufacturer_limitation_en IS 'English rendering of explicit manufacturer precipitation or coverage limitation';