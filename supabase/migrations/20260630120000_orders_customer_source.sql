-- 結帳頁客戶來源調查（Facebook / Instagram / Threads / Google / 親友介紹）

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_source text;

COMMENT ON COLUMN public.orders.customer_source IS '客戶來源：facebook / instagram / threads / google / referral';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_customer_source_chk'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_customer_source_chk
      CHECK (
        customer_source IS NULL
        OR customer_source IN ('facebook', 'instagram', 'threads', 'google', 'referral')
      );
  END IF;
END
$$;
