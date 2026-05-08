-- 特殊報價單（多組合）轉出之訂單，供後台訂單列表顯示專用標籤
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS is_from_special_quotation boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orders.is_from_special_quotation IS '由特殊報價單（多訂單組合）拆單建立之訂單';
