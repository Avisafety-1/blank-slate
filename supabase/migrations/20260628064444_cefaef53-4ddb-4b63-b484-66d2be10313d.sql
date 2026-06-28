
ALTER TABLE public.changelog_entries ADD COLUMN IF NOT EXISTS image_url text;

-- Storage policies for changelog-images bucket
CREATE POLICY "Changelog images readable by all authenticated"
ON storage.objects FOR SELECT
TO authenticated, anon
USING (bucket_id = 'changelog-images');

CREATE POLICY "Superadmin can upload changelog images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'changelog-images' AND public.has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Superadmin can update changelog images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'changelog-images' AND public.has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Superadmin can delete changelog images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'changelog-images' AND public.has_role(auth.uid(), 'superadmin'::app_role));
