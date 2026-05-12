
ALTER TABLE public.dji_credentials ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

-- Backfill: pin existing credentials to the user's current profile.company_id
UPDATE public.dji_credentials dc
SET company_id = p.company_id
FROM public.profiles p
WHERE dc.user_id = p.id AND dc.company_id IS NULL;
