ALTER TABLE public.equipment_log_entries REPLICA IDENTITY FULL;
ALTER TABLE public.drone_log_entries REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.equipment_log_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.drone_log_entries;