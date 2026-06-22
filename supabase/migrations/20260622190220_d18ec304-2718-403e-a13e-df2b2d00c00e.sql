
ALTER TABLE public.personnel_log_entries
  ADD COLUMN IF NOT EXISTS flight_log_id UUID NULL
    REFERENCES public.flight_logs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS personnel_log_entries_flight_log_id_idx
  ON public.personnel_log_entries(flight_log_id);
