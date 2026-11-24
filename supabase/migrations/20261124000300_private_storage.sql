-- Private KYC storage. Clients call record_document_access before requesting a
-- signed URL; only owners and verification reviewers may read these objects.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('driver-documents', 'driver-documents', false, 10485760,
        ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS driver_documents_owner_insert ON storage.objects;
CREATE POLICY driver_documents_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'driver-documents'
    AND public.user_is_active(auth.uid())
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND cardinality(storage.filename(name)) = 1
  );

DROP POLICY IF EXISTS driver_documents_owner_select ON storage.objects;
CREATE POLICY driver_documents_owner_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'driver-documents'
    AND public.user_is_active(auth.uid())
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND cardinality(storage.filename(name)) = 1
  );

DROP POLICY IF EXISTS driver_documents_owner_delete ON storage.objects;
CREATE POLICY driver_documents_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'driver-documents'
    AND public.user_is_active(auth.uid())
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND cardinality(storage.filename(name)) = 1
  );

DROP POLICY IF EXISTS driver_documents_staff_select ON storage.objects;
CREATE POLICY driver_documents_staff_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'driver-documents'
    AND public.has_staff_permission('review_verification')
    AND cardinality(storage.filename(name)) = 1
  );

DROP POLICY IF EXISTS driver_documents_staff_delete ON storage.objects;
CREATE POLICY driver_documents_staff_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'driver-documents'
    AND public.has_staff_permission('review_verification')
    AND cardinality(storage.filename(name)) = 1
  );

-- No public policy, UPDATE policy or anon grant exists for this bucket.
