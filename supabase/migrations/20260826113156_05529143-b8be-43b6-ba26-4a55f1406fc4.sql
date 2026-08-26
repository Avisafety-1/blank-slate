CREATE POLICY "Service role manages user DroneLog keys"
ON public.user_dronelog_keys
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);