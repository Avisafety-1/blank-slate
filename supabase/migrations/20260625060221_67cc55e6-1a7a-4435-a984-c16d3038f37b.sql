DROP POLICY IF EXISTS "Users can upload their own signature" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own signature" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own signature" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own signature"   ON storage.objects;

CREATE POLICY "Users can read their own signature"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'signatures' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own signature"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'signatures' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own signature"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'signatures' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'signatures' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own signature"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'signatures' AND auth.uid()::text = (storage.foldername(name))[1]);