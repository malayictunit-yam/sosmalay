
ALTER TABLE public.emergencies
  ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responder_name text,
  ADD COLUMN IF NOT EXISTS en_route_at timestamptz,
  ADD COLUMN IF NOT EXISTS arrived_at timestamptz;

-- Ensure realtime for emergencies (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'emergencies'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.emergencies';
  END IF;
END $$;

-- Storage policies for emergency-images bucket
DROP POLICY IF EXISTS "emergency images readable by authenticated" ON storage.objects;
CREATE POLICY "emergency images readable by authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'emergency-images');

DROP POLICY IF EXISTS "citizens upload own emergency images" ON storage.objects;
CREATE POLICY "citizens upload own emergency images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'emergency-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "citizens delete own emergency images" ON storage.objects;
CREATE POLICY "citizens delete own emergency images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'emergency-images'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_responder(auth.uid()))
  );
