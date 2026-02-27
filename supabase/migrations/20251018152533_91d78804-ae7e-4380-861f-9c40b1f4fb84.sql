-- 添加 product_name 欄位來存儲商品名稱
ALTER TABLE public.cart ADD COLUMN product_name TEXT;

-- 將現有的 product_id 設為可空（如果需要的話）
-- product_id 欄位保留用於未來與 products 表的關聯
ALTER TABLE public.cart ALTER COLUMN product_id DROP NOT NULL;