ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS propagate_mission_types boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.company_mission_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, label)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_mission_types TO authenticated;
GRANT ALL ON public.company_mission_types TO service_role;

ALTER TABLE public.company_mission_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mission_types_select"
ON public.company_mission_types
FOR SELECT
TO authenticated
USING (company_id = ANY (public.get_user_visible_company_ids(auth.uid())));

CREATE POLICY "mission_types_insert"
ON public.company_mission_types
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.get_user_company_id(auth.uid())
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "mission_types_update"
ON public.company_mission_types
FOR UPDATE
TO authenticated
USING (
  company_id = public.get_user_company_id(auth.uid())
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "mission_types_delete"
ON public.company_mission_types
FOR DELETE
TO authenticated
USING (
  company_id = public.get_user_company_id(auth.uid())
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE INDEX IF NOT EXISTS idx_company_mission_types_company ON public.company_mission_types(company_id, sort_order);

INSERT INTO public.company_mission_types (company_id, label, sort_order)
SELECT c.id, t.label, t.ord
FROM public.companies c
CROSS JOIN (VALUES
  ('Inspeksjon', 10),
  ('Kartlegging', 20),
  ('Foto/film', 30),
  ('Filming', 40),
  ('Fotografering', 50),
  ('Søk og redning', 60),
  ('Landbruk', 70),
  ('Bygg/anlegg', 80),
  ('Forskning', 90),
  ('Levering', 100)
) AS t(label, ord)
ON CONFLICT (company_id, label) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_company_mission_types()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.company_mission_types (company_id, label, sort_order)
  VALUES
    (NEW.id, 'Inspeksjon', 10),
    (NEW.id, 'Kartlegging', 20),
    (NEW.id, 'Foto/film', 30),
    (NEW.id, 'Filming', 40),
    (NEW.id, 'Fotografering', 50),
    (NEW.id, 'Søk og redning', 60),
    (NEW.id, 'Landbruk', 70),
    (NEW.id, 'Bygg/anlegg', 80),
    (NEW.id, 'Forskning', 90),
    (NEW.id, 'Levering', 100)
  ON CONFLICT (company_id, label) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_company_mission_types ON public.companies;
CREATE TRIGGER trg_seed_company_mission_types
AFTER INSERT ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.seed_company_mission_types();