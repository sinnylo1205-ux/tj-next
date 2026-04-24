-- 客戶類型：將「公關公司/福委會」(pr_agency) 拆為「公關代理」(pr_agent) 與「公司自己」(company_self)；
-- 既有 pr_agency 列一律改為 pr_agent（語意上等同公關代理）。

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_customer_type_check') THEN
    ALTER TABLE public.orders DROP CONSTRAINT orders_customer_type_check;
  END IF;
END $$;

UPDATE public.orders
SET customer_type = 'pr_agent'
WHERE customer_type = 'pr_agency';

ALTER TABLE public.orders ADD CONSTRAINT orders_customer_type_check
  CHECK (customer_type IS NULL OR customer_type IN ('general', 'flash_ip', 'pr_agent', 'company_self'));

COMMENT ON COLUMN public.orders.customer_type IS '客戶類型：general=一般用戶、flash_ip=快閃店/IP、pr_agent=公關代理、company_self=公司自己（舊 pr_agency 已遷移為 pr_agent）';
