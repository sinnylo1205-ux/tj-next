-- 客戶來源：新增「再次回購」(repurchase)，對齊 Google 表單選項

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
      'referral',
      'repurchase'
    )
  );

COMMENT ON COLUMN public.orders.customer_source IS
  '客戶來源：facebook / instagram / facebook_ads / instagram_ads / threads / google / referral / repurchase';

ALTER TABLE public.quotation_orders DROP CONSTRAINT IF EXISTS quotation_orders_customer_source_chk;

ALTER TABLE public.quotation_orders
  ADD CONSTRAINT quotation_orders_customer_source_chk
  CHECK (
    customer_source IS NULL
    OR customer_source IN (
      'facebook',
      'instagram',
      'facebook_ads',
      'instagram_ads',
      'threads',
      'google',
      'referral',
      'repurchase'
    )
  );

COMMENT ON COLUMN public.quotation_orders.customer_source IS
  '客戶來源：facebook / instagram / facebook_ads / instagram_ads / threads / google / referral / repurchase（僅後台；不上 PDF）';
