-- 訂單品項：管理員補傳附圖（對應單一 order_item）
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS admin_media_url text;

COMMENT ON COLUMN public.order_items.admin_media_url IS '管理員補傳之該品項附圖（公開 URL，custom_asset）';
