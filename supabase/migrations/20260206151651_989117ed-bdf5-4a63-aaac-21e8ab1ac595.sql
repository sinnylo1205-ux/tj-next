-- 允許 admin 上傳到 custom_asset bucket
CREATE POLICY "Admins can upload to custom_asset"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'custom_asset'
    AND (SELECT public.has_role(auth.uid(), 'admin'))
  );

-- 允許公開讀取 custom_asset bucket
CREATE POLICY "Public read access for custom_asset"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'custom_asset');