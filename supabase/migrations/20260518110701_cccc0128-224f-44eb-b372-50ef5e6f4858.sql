-- =========================================================
-- 1) company_mission_roles re-sync trigger
-- =========================================================

CREATE OR REPLACE FUNCTION public.propagate_mission_roles_to_children()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  src_company_id uuid;
  is_parent boolean;
  parent_propagates boolean;
BEGIN
  -- Use NEW for INSERT/UPDATE, OLD for DELETE
  src_company_id := COALESCE(NEW.company_id, OLD.company_id);

  -- Only act if the row belongs to a parent company with propagation on
  SELECT (parent_company_id IS NULL),
         COALESCE(propagate_mission_roles, false)
    INTO is_parent, parent_propagates
    FROM public.companies
   WHERE id = src_company_id;

  IF NOT is_parent OR NOT parent_propagates THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Add this role (by name) to every child that doesn't already have it
    INSERT INTO public.company_mission_roles (company_id, name)
    SELECT c.id, NEW.name
      FROM public.companies c
     WHERE c.parent_company_id = src_company_id
       AND NOT EXISTS (
         SELECT 1 FROM public.company_mission_roles r
          WHERE r.company_id = c.id AND r.name = NEW.name
       );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- If the name changed, rename matching roles in every child
    IF NEW.name IS DISTINCT FROM OLD.name THEN
      UPDATE public.company_mission_roles r
         SET name = NEW.name
        FROM public.companies c
       WHERE r.company_id = c.id
         AND c.parent_company_id = src_company_id
         AND r.name = OLD.name;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Delete matching role in every child
    DELETE FROM public.company_mission_roles r
     USING public.companies c
     WHERE r.company_id = c.id
       AND c.parent_company_id = src_company_id
       AND r.name = OLD.name;
    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_mission_roles ON public.company_mission_roles;
CREATE TRIGGER trg_propagate_mission_roles
AFTER INSERT OR UPDATE OR DELETE ON public.company_mission_roles
FOR EACH ROW
EXECUTE FUNCTION public.propagate_mission_roles_to_children();

-- Backfill: ensure every child of a propagating parent has all parent roles
INSERT INTO public.company_mission_roles (company_id, name)
SELECT c.id, pr.name
  FROM public.companies p
  JOIN public.companies c ON c.parent_company_id = p.id
  JOIN public.company_mission_roles pr ON pr.company_id = p.id
 WHERE COALESCE(p.propagate_mission_roles, false) = true
   AND NOT EXISTS (
     SELECT 1 FROM public.company_mission_roles cr
      WHERE cr.company_id = c.id AND cr.name = pr.name
   );

-- =========================================================
-- 2) company_sora_config defaults re-sync trigger
-- =========================================================

CREATE OR REPLACE FUNCTION public.propagate_sora_defaults_to_children()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_parent boolean;
  parent_propagates boolean;
BEGIN
  -- Only act if the SORA config row belongs to a parent with propagation on
  SELECT (parent_company_id IS NULL),
         COALESCE(propagate_sora_buffer_mode, false)
    INTO is_parent, parent_propagates
    FROM public.companies
   WHERE id = NEW.company_id;

  IF NOT is_parent OR NOT parent_propagates THEN
    RETURN NEW;
  END IF;

  IF NEW.default_buffer_mode IS DISTINCT FROM OLD.default_buffer_mode
     OR NEW.default_flight_geography_m IS DISTINCT FROM OLD.default_flight_geography_m
     OR NEW.default_flight_altitude_m IS DISTINCT FROM OLD.default_flight_altitude_m THEN

    -- Upsert defaults onto every child's sora config row
    INSERT INTO public.company_sora_config (
      company_id, default_buffer_mode, default_flight_geography_m, default_flight_altitude_m
    )
    SELECT c.id, NEW.default_buffer_mode, NEW.default_flight_geography_m, NEW.default_flight_altitude_m
      FROM public.companies c
     WHERE c.parent_company_id = NEW.company_id
    ON CONFLICT (company_id) DO UPDATE
      SET default_buffer_mode = EXCLUDED.default_buffer_mode,
          default_flight_geography_m = EXCLUDED.default_flight_geography_m,
          default_flight_altitude_m = EXCLUDED.default_flight_altitude_m;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_sora_defaults ON public.company_sora_config;
CREATE TRIGGER trg_propagate_sora_defaults
AFTER UPDATE ON public.company_sora_config
FOR EACH ROW
EXECUTE FUNCTION public.propagate_sora_defaults_to_children();

-- Backfill SORA defaults to children of propagating parents
INSERT INTO public.company_sora_config (
  company_id, default_buffer_mode, default_flight_geography_m, default_flight_altitude_m
)
SELECT c.id, ps.default_buffer_mode, ps.default_flight_geography_m, ps.default_flight_altitude_m
  FROM public.companies p
  JOIN public.companies c ON c.parent_company_id = p.id
  JOIN public.company_sora_config ps ON ps.company_id = p.id
 WHERE COALESCE(p.propagate_sora_buffer_mode, false) = true
ON CONFLICT (company_id) DO UPDATE
  SET default_buffer_mode = EXCLUDED.default_buffer_mode,
      default_flight_geography_m = EXCLUDED.default_flight_geography_m,
      default_flight_altitude_m = EXCLUDED.default_flight_altitude_m
 WHERE
   public.company_sora_config.default_buffer_mode IS DISTINCT FROM EXCLUDED.default_buffer_mode
   OR public.company_sora_config.default_flight_geography_m IS DISTINCT FROM EXCLUDED.default_flight_geography_m
   OR public.company_sora_config.default_flight_altitude_m IS DISTINCT FROM EXCLUDED.default_flight_altitude_m;
