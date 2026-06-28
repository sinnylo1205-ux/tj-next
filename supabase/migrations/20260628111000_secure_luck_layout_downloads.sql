-- 幸運籤餅排版 Excel 含客戶簽文內容，不應以可猜測的永久公開 URL 存取。

DROP POLICY IF EXISTS "Public read access for custom_asset" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for custom_asset except luck layouts" ON storage.objects;
CREATE POLICY "Public read access for custom_asset except luck layouts"
  ON storage.objects FOR SELECT
  TO public
  USING (
    bucket_id = 'custom_asset'
    AND name NOT LIKE 'website_img/luck_layouts/%'
  );

DROP POLICY IF EXISTS "Admins can read luck layouts in custom_asset" ON storage.objects;
CREATE POLICY "Admins can read luck layouts in custom_asset"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'custom_asset'
    AND name LIKE 'website_img/luck_layouts/%'
    AND public.has_role(auth.uid(), 'admin')
  );

COMMENT ON COLUMN public.order_items.luck_layout_xlsx_url IS '幸運籤餅純文字 CSV 排版後的 xlsx storage path；下載時由 Edge Function 產生短效 signed URL';
