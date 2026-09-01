ALTER TABLE public.flight_logs
  ADD COLUMN IF NOT EXISTS dji_log_id text;

CREATE INDEX IF NOT EXISTS idx_flight_logs_company_dji_log_id
  ON public.flight_logs (company_id, dji_log_id)
  WHERE dji_log_id IS NOT NULL;

COMMENT ON COLUMN public.flight_logs.dji_log_id IS 'DroneLog/DJI Cloud log ID used to recognize logs already imported from DJI cloud';