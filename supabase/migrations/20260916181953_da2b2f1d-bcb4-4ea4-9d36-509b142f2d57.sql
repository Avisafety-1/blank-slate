DELETE FROM public.flighthub2_positions a
USING public.flighthub2_positions b
WHERE a.sn = b.sn
  AND (b.time_stamp, b.id) > (a.time_stamp, a.id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fh2_positions_sn_unique
  ON public.flighthub2_positions (sn);