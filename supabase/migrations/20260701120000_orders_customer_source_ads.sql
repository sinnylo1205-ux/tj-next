-- 結帳頁客戶來源：新增 FB廣告、IG廣告
-- 日後 CRM 手動單歸屬修正盤點（只讀，勿在未備份前執行 UPDATE）：
--   SELECT o.id, o.who_receive, o.orderer_name, o.user_id, o.line_user_id, o.created_at
--   FROM orders o
--   WHERE o.is_manual_order = true
--     AND o.user_id IN (SELECT user_id FROM user_roles WHERE role = 'admin')
--   ORDER BY o.created_at DESC;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_customer_source_chk;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_customer_source_chk
  CHECK (
    customer_source IS NULL
    OR customer_source IN (
      'facebook',
      'instagram',
      'facebook_ads',
      'instagram_ads',
      'threads',
      'google',
      'referral'
    )
  );

COMMENT ON COLUMN public.orders.customer_source IS
  '客戶來源：facebook / instagram / facebook_ads / instagram_ads / threads / google / referral';
