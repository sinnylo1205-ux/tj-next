-- 預建報價單：顧客來源調查（與 orders.customer_source 對齊；不上報價單 PDF）
ALTER TABLE public.quotation_orders
  ADD COLUMN IF NOT EXISTS customer_source text;

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
      'referral'
    )
  );

COMMENT ON COLUMN public.quotation_orders.customer_source IS
  '客戶來源：facebook / instagram / facebook_ads / instagram_ads / threads / google / referral（僅後台；不上 PDF）';
