ALTER TABLE public.flight_logs
  ADD COLUMN IF NOT EXISTS entry_source TEXT NOT NULL DEFAULT 'logged';

ALTER TABLE public.flight_logs
  DROP CONSTRAINT IF EXISTS flight_logs_entry_source_check;
ALTER TABLE public.flight_logs
  ADD CONSTRAINT flight_logs_entry_source_check CHECK (entry_source IN ('logged','manual'));

UPDATE public.flight_logs
SET entry_source = 'manual'
WHERE drone_id IS NULL
  AND (notes ILIKE 'Manuelt lagt til%' OR notes ILIKE 'Startbalanse%');

CREATE INDEX IF NOT EXISTS flight_logs_entry_source_idx ON public.flight_logs(entry_source);