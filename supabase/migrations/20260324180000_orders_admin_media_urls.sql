-- 後台補傳訂單圖片／合成圖（公開 URL 陣列，存於 custom_asset 同 bucket 慣例路徑）
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS admin_media_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.orders.admin_media_urls IS '管理員上傳之訂單相關圖片 URL 陣列（JSON array of string）';
