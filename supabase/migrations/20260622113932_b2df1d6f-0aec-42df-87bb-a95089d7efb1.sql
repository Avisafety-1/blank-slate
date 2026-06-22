-- Drop gammel logikk fra forrige migrasjon
DROP TRIGGER IF EXISTS trg_update_profile_flight_hours ON public.flight_logs;
DROP FUNCTION IF EXISTS public.update_profile_flight_hours_on_log() CASCADE;
DROP FUNCTION IF EXISTS public.recompute_profile_flyvetimer(uuid) CASCADE;

-- Ny recompute basert på personnel-junction
CREATE OR REPLACE FUNCTION public.recompute_profile_flyvetimer(_profile_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
  SET flyvetimer = COALESCE((
    SELECT SUM(fl.flight_duration_minutes)::numeric / 60.0
    FROM public.flight_logs fl
    JOIN public.flight_log_personnel flp ON flp.flight_log_id = fl.id
    WHERE flp.profile_id = _profile_id
  ), 0)
  WHERE id = _profile_id;
$$;

REVOKE EXECUTE ON FUNCTION public.recompute_profile_flyvetimer(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_profile_flyvetimer(uuid) TO service_role;

-- Trigger 1: når en flytur endrer varighet eller slettes, recompute for alle koblede piloter
CREATE OR REPLACE FUNCTION public.tg_flight_logs_recompute_pilots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    FOR _pid IN
      SELECT profile_id FROM public.flight_log_personnel WHERE flight_log_id = OLD.id
    LOOP
      PERFORM public.recompute_profile_flyvetimer(_pid);
    END LOOP;
    RETURN OLD;
  ELSE
    FOR _pid IN
      SELECT profile_id FROM public.flight_log_personnel WHERE flight_log_id = NEW.id
    LOOP
      PERFORM public.recompute_profile_flyvetimer(_pid);
    END LOOP;
    RETURN NEW;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tg_flight_logs_recompute_pilots() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_flight_logs_recompute_pilots
AFTER INSERT OR DELETE OR UPDATE OF flight_duration_minutes
ON public.flight_logs
FOR EACH ROW EXECUTE FUNCTION public.tg_flight_logs_recompute_pilots();

-- Trigger 2: når personnel-kobling opprettes/slettes, recompute for berørt pilot
CREATE OR REPLACE FUNCTION public.tg_flp_recompute_pilot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_profile_flyvetimer(OLD.profile_id);
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public.recompute_profile_flyvetimer(NEW.profile_id);
    RETURN NEW;
  ELSE
    IF NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
      PERFORM public.recompute_profile_flyvetimer(OLD.profile_id);
      PERFORM public.recompute_profile_flyvetimer(NEW.profile_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tg_flp_recompute_pilot() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_flp_recompute_pilot
AFTER INSERT OR UPDATE OR DELETE
ON public.flight_log_personnel
FOR EACH ROW EXECUTE FUNCTION public.tg_flp_recompute_pilot();

-- Full omberegning for alle profiler (idempotent)
DO $$
DECLARE
  _id uuid;
BEGIN
  FOR _id IN SELECT id FROM public.profiles LOOP
    PERFORM public.recompute_profile_flyvetimer(_id);
  END LOOP;
END;
$$;