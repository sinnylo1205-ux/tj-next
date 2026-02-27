-- 移除 customizer_uploads bucket 的公開 DELETE 政策
-- 前端已不再從 Storage 刪除檔案，改用 lifecycle policy 自動清理

DROP POLICY IF EXISTS "Allow public delete ultdk2_0" ON storage.objects;