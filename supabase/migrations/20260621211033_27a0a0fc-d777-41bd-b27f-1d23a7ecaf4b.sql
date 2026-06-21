-- Backfill profiles.flyvetimer from flight_logs
UPDATE public.profiles p
SET flyvetimer = COALESCE(s.hours, 0)
FROM (
  SELECT user_id, SUM(flight_duration_minutes)/60.0 AS hours
  FROM public.flight_logs
  WHERE user_id IS NOT NULL
  GROUP BY user_id
) s
WHERE p.id = s.user_id;

-- Recompute function for a single user
CREATE OR REPLACE FUNCTION public.recompute_profile_flyvetimer(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  UPDATE public.profiles
  SET flyvetimer = COALESCE((
    SELECT SUM(flight_duration_minutes)/60.0
    FROM public.flight_logs
    WHERE user_id = _user_id
  ), 0)
  WHERE id = _user_id;
END;
$$;

-- Trigger function on flight_logs
CREATE OR REPLACE FUNCTION public.update_profile_flight_hours_on_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recompute_profile_flyvetimer(NEW.user_id);
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.recompute_profile_flyvetimer(NEW.user_id);
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      PERFORM public.recompute_profile_flyvetimer(OLD.user_id);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_profile_flyvetimer(OLD.user_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_profile_flight_hours ON public.flight_logs;
CREATE TRIGGER trg_update_profile_flight_hours
AFTER INSERT OR UPDATE OR DELETE ON public.flight_logs
FOR EACH ROW EXECUTE FUNCTION public.update_profile_flight_hours_on_log();