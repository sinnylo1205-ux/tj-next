-- 客戶可建立自己的訂單與回報匯款末五碼，但不得直接偽造已付款、
-- 處理中、手動單、報價單或其他後台/金流專用狀態。

CREATE OR REPLACE FUNCTION public.prevent_customer_order_mutations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'customers may only create their own orders';
    END IF;

    IF COALESCE(NEW.payment_step::text, 'pending') <> 'pending'
      OR COALESCE(NEW.order_status::text, 'awaiting_payment') <> 'awaiting_payment' THEN
      RAISE EXCEPTION 'customers may only create pending awaiting-payment orders';
    END IF;

    IF COALESCE(NEW.is_manual_order, false)
      OR COALESCE(NEW.is_from_quotation, false)
      OR COALESCE(NEW.is_from_special_quotation, false)
      OR COALESCE(NEW.auto_cancel_exempt, false)
      OR COALESCE(NEW.merchant_confirmed, false)
      OR NEW.transfer_last5 IS NOT NULL
      OR NEW.admin_note IS NOT NULL
      OR NEW.admin_verified_at IS NOT NULL
      OR NEW.shipped_at IS NOT NULL
      OR NEW.delivered_at IS NOT NULL THEN
      RAISE EXCEPTION 'customers may not set privileged order fields';
    END IF;

    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - 'payment_step' - 'transfer_last5' - 'updated_at')
    IS DISTINCT FROM
    (to_jsonb(OLD) - 'payment_step' - 'transfer_last5' - 'updated_at') THEN
    RAISE EXCEPTION 'customers may only update payment submission fields';
  END IF;

  IF COALESCE(NEW.payment_step::text, '') NOT IN ('pending', 'submitted') THEN
    RAISE EXCEPTION 'customers may not verify their own payments';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_customer_order_mutations ON public.orders;
CREATE TRIGGER prevent_customer_order_mutations
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_customer_order_mutations();
