ALTER TABLE public.drones REPLICA IDENTITY FULL;
ALTER TABLE public.equipment REPLICA IDENTITY FULL;
ALTER TABLE public.drone_accessories REPLICA IDENTITY FULL;
ALTER TABLE public.drone_equipment REPLICA IDENTITY FULL;
ALTER TABLE public.drone_inspections REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='drones') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.drones;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='equipment') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.equipment;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='drone_equipment') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.drone_equipment;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='drone_inspections') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.drone_inspections;
  END IF;
END $$;