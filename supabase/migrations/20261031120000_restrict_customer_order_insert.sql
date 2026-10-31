-- 會員 INSERT orders 不得直接寫成已付款／處理中／手動單。
--
-- 既有 UPDATE policy 只允許 payment_step 停在 pending／submitted，
-- 因此會員無法用 UPDATE 把訂單改成 verified。
-- 但 "Users can insert their own orders" 與 "Members can create own orders"
-- 只檢查 user_id = auth.uid()，INSERT 仍可指定：
--   payment_step = verified
--   order_status = processing
-- 後台工作曆會把 verified + processing 排進製作，
-- 訂單管理「處理中」分頁會顯示「已確認」，
-- 24 小時自動取消只掃 payment_step = pending，這張單不會被清掉。
--
-- 結帳頁寫入的是 payment_step=pending、order_status=awaiting_payment。
-- 管理員（has_role admin）與 service_role（報價轉單、綠界回呼）不受此限。

CREATE OR REPLACE FUNCTION public.enforce_customer_order_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- 綠界回呼、報價轉單走 service_role；後台手動單走 admin JWT。
  -- current_user 補上 JWT claim 未帶入時的 service_role 連線。
  IF coalesce(auth.role(), '') = 'service_role'
     OR current_user IN ('service_role', 'supabase_admin', 'postgres')
     OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_step::text IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'customer orders must be created as payment_step pending'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.order_status::text IS DISTINCT FROM 'awaiting_payment' THEN
    RAISE EXCEPTION 'customer orders must be created as order_status awaiting_payment'
      USING ERRCODE = '42501';
  END IF;

  IF coalesce(NEW.is_manual_order, false) THEN
    RAISE EXCEPTION 'customers cannot create manual orders'
      USING ERRCODE = '42501';
  END IF;

  IF coalesce(NEW.auto_cancel_exempt, false) THEN
    RAISE EXCEPTION 'customers cannot set auto_cancel_exempt'
      USING ERRCODE = '42501';
  END IF;

  IF coalesce(NEW.is_from_quotation, false)
     OR coalesce(NEW.is_from_special_quotation, false) THEN
    RAISE EXCEPTION 'customers cannot mark quotation-origin orders'
      USING ERRCODE = '42501';
  END IF;

  IF coalesce(NEW.merchant_confirmed, false) THEN
    RAISE EXCEPTION 'customers cannot set merchant_confirmed'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.payment_status IS NOT NULL AND NEW.payment_status IS DISTINCT FROM 'unpaid' THEN
    RAISE EXCEPTION 'customers cannot set payment_status to a paid state'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.paid_at IS NOT NULL
     OR NEW.confirmed_at IS NOT NULL
     OR NEW.shipped_at IS NOT NULL
     OR NEW.delivered_at IS NOT NULL
     OR NEW.admin_verified_at IS NOT NULL THEN
    RAISE EXCEPTION 'customers cannot set payment or fulfillment timestamps'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_customer_order_insert ON public.orders;

CREATE TRIGGER enforce_customer_order_insert
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_customer_order_insert();

COMMENT ON FUNCTION public.enforce_customer_order_insert() IS
  'Rejects authenticated customer inserts that forge paid, in-production, manual, or auto-cancel-exempt orders. Admin and service_role bypass.';
