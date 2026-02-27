-- =============================================
-- 階段二：資安修復 - RLS 政策優化
-- =============================================

-- 1. 修復 user_log_in RLS 政策
-- 刪除過於寬鬆的 "Require authentication for all access" 政策
DROP POLICY IF EXISTS "Require authentication for all access" ON public.user_log_in;

-- 用戶只能查看自己的資料（保留現有政策，確保一致性）
-- "Users can view their own profile" 已存在且正確

-- 2. 修復 orders RLS 政策
-- 刪除過於寬鬆的 "Require authentication for all access" 政策
DROP POLICY IF EXISTS "Require authentication for all access" ON public.orders;

-- 現有的 "Users can read their own orders or admins all" 已經正確
-- 現有的 "Users can insert their own orders" 已經正確
-- 現有的 "Users can update limited fields on their own orders" 已經正確
-- 現有的 "Admins or service_role can update orders" 已經正確
-- 現有的 "Admins or service_role can delete orders" 已經正確

-- 3. 為 transfer_last5 敏感欄位建立額外保護
-- 建立一個 view 來隱藏敏感欄位給非擁有者
CREATE OR REPLACE VIEW public.orders_public
WITH (security_invoker = on) AS
SELECT 
  id,
  user_id,
  created_at,
  updated_at,
  order_status,
  payment_method,
  payment_step,
  total_amount,
  subtotal,
  discount_amount,
  shipping_fee,
  shipping_way,
  shipping_address_text,
  recipient_name,
  who_receive,
  notes,
  expected_pickup_date,
  is_manual_order,
  merchant_confirmed,
  admin_verified_at,
  shipped_at,
  delivered_at,
  "Email",
  -- 敏感欄位：只有訂單擁有者或管理員可見
  CASE 
    WHEN user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) 
    THEN transfer_last5 
    ELSE NULL 
  END as transfer_last5
FROM public.orders;