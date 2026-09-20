ALTER TABLE public.drone_live_streams REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.drone_live_streams;