INSERT INTO public.app_config (key, value)
VALUES ('app_version_force_immediate', '0')
ON CONFLICT (key) DO NOTHING;

CREATE POLICY "Superadmins can insert app_config"
  ON public.app_config FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));