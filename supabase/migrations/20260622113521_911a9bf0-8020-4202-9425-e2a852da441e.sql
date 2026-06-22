-- Snapshot av profiles.flyvetimer FØR opprydding 2026-06-22
-- Brukes for full rollback hvis noe går galt.
CREATE TABLE IF NOT EXISTS public._backup_flyvetimer_2026_06_22 (
  profile_id uuid PRIMARY KEY,
  full_name text,
  flyvetimer_before numeric,
  snapshot_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public._backup_flyvetimer_2026_06_22 TO service_role;

ALTER TABLE public._backup_flyvetimer_2026_06_22 ENABLE ROW LEVEL SECURITY;

-- Kun service_role har tilgang — ingen policy for vanlige brukere (intern backup).
CREATE POLICY "service role manages backup"
  ON public._backup_flyvetimer_2026_06_22
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Snapshot også av flight_log_personnel-radene som finnes nå, så vi kan rulle tilbake backfill.
CREATE TABLE IF NOT EXISTS public._backup_flight_log_personnel_2026_06_22 (
  flight_log_id uuid,
  profile_id uuid,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (flight_log_id, profile_id)
);

GRANT ALL ON public._backup_flight_log_personnel_2026_06_22 TO service_role;
ALTER TABLE public._backup_flight_log_personnel_2026_06_22 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages backup flp"
  ON public._backup_flight_log_personnel_2026_06_22
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Fyll snapshot
INSERT INTO public._backup_flyvetimer_2026_06_22 (profile_id, full_name, flyvetimer_before)
SELECT id, full_name, flyvetimer FROM public.profiles
ON CONFLICT (profile_id) DO NOTHING;

INSERT INTO public._backup_flight_log_personnel_2026_06_22 (flight_log_id, profile_id)
SELECT flight_log_id, profile_id FROM public.flight_log_personnel
ON CONFLICT DO NOTHING;