-- 啟用 pg_cron 和 pg_net 擴展
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 授予 postgres 使用 cron schema 的權限
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- 建立清理 line-images bucket 的函數（保留 line/ 資料夾）
CREATE OR REPLACE FUNCTION public.cleanup_line_images()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id = 'line-images'
    AND name NOT LIKE 'line/%';
END;
$$;

-- 建立清理 customizer_uploads bucket 的函數（刪除超過 60 天的檔案）
CREATE OR REPLACE FUNCTION public.cleanup_customizer_uploads()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id = 'customizer_uploads'
    AND created_at < NOW() - INTERVAL '60 days';
END;
$$;