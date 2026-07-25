CREATE OR REPLACE FUNCTION public.get_notams_in_bounds(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision
)
RETURNS SETOF public.notams
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.*
  FROM public.notams n
  WHERE (n.effective_end IS NULL
         OR n.effective_end > now()
         OR n.effective_end_interpretation IN ('PERM','EST'))
    AND (
      (n.geometry IS NOT NULL
        AND n.geometry && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326))
      OR
      (n.geometry IS NULL
        AND n.center_lat IS NOT NULL
        AND n.center_lat BETWEEN min_lat AND max_lat
        AND n.center_lng BETWEEN min_lng AND max_lng)
    )
  LIMIT 3000
$$;

GRANT EXECUTE ON FUNCTION public.get_notams_in_bounds(double precision, double precision, double precision, double precision) TO anon, authenticated, service_role;