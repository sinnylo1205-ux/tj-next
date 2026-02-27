-- 修改 orders 表結構，支持新的訂單流程
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS merchant_confirmed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid',
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE;

-- 更新 status 欄位的註釋
COMMENT ON COLUMN orders.status IS 'pending(待付款), processing(待出貨), shipping(待收貨), completed(已完成), cancelled(已取消)';
COMMENT ON COLUMN orders.merchant_confirmed IS '商家是否已確認訂單可以付款';
COMMENT ON COLUMN orders.payment_status IS 'unpaid(未付款), paid(已付款), refunded(已退款)';

-- 為 orders 表添加 RLS 政策，允許用戶更新自己的訂單付款方式
DROP POLICY IF EXISTS "Users can update payment method for their pending orders" ON orders;
CREATE POLICY "Users can update payment method for their pending orders"
ON orders
FOR UPDATE
USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (auth.uid() = user_id AND status = 'pending');