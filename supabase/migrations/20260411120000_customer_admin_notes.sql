-- 後台「訂單客戶管理」：依 who_receive 儲存售後備註（與訂單彙總鍵一致）
CREATE TABLE IF NOT EXISTS public.customer_admin_notes (
  who_receive text PRIMARY KEY,
  after_sales_status text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.customer_admin_notes IS '後台客戶管理：售後狀況等（鍵為訂單 who_receive）';
COMMENT ON COLUMN public.customer_admin_notes.after_sales_status IS '售後狀況／備註（管理員填寫）';

ALTER TABLE public.customer_admin_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read customer_admin_notes" ON public.customer_admin_notes;
CREATE POLICY "Admins can read customer_admin_notes"
  ON public.customer_admin_notes FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert customer_admin_notes" ON public.customer_admin_notes;
CREATE POLICY "Admins can insert customer_admin_notes"
  ON public.customer_admin_notes FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update customer_admin_notes" ON public.customer_admin_notes;
CREATE POLICY "Admins can update customer_admin_notes"
  ON public.customer_admin_notes FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Service role can manage customer_admin_notes" ON public.customer_admin_notes;
CREATE POLICY "Service role can manage customer_admin_notes"
  ON public.customer_admin_notes FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
