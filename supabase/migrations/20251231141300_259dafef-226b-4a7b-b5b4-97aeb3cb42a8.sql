-- 新增 is_manual_order 欄位到 orders 表
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS is_manual_order boolean DEFAULT false;

-- 添加註解
COMMENT ON COLUMN public.orders.is_manual_order IS '標記是否為管理員手動建立的訂單';