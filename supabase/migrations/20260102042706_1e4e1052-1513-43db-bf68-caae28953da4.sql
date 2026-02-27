-- 為 customizer_uploads bucket 添加刪除權限
CREATE POLICY "Allow public delete ultdk2_0"
ON storage.objects
FOR DELETE
TO public
USING (bucket_id = 'customizer_uploads');