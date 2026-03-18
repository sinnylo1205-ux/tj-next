-- 新增 auto_cancel_exempt 欄位到 orders 表
-- 用於管理員建立/轉單時，避免被 24 小時未付款自動取消機制影響
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS auto_cancel_exempt boolean DEFAULT false;

COMMENT ON COLUMN public.orders.auto_cancel_exempt IS '若為 true，則不受 24 小時未付款自動取消影響（管理員手動處理用）';

