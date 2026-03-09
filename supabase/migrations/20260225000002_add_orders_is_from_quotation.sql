-- 新增 is_from_quotation 欄位到 orders 表
-- 標記訂單是否來自報價單轉換（報價單客戶非網站註冊會員，用戶欄位顯示 who_receive）
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS is_from_quotation boolean DEFAULT false;

COMMENT ON COLUMN public.orders.is_from_quotation IS '訂單是否來自報價單轉換；為 true 時，訂單管理「用戶」欄位顯示 who_receive（報價單）';
