-- 客戶類型標籤（後台用）；訂購人姓名（與 who_receive 實際收件人分開）
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_type TEXT;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS orderer_name TEXT;

COMMENT ON COLUMN public.orders.orderer_name IS '訂購人／聯絡姓名；實際收件人為 who_receive（舊手動單可能僅有 who_receive）';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_customer_type_check') THEN
    ALTER TABLE public.orders DROP CONSTRAINT orders_customer_type_check;
  END IF;
END $$;

ALTER TABLE public.orders ADD CONSTRAINT orders_customer_type_check
  CHECK (customer_type IS NULL OR customer_type IN ('general', 'flash_ip', 'pr_agency'));

COMMENT ON COLUMN public.orders.customer_type IS '客戶類型：general=一般用戶、flash_ip=快閃店/IP、pr_agency=公關公司/福委會';
