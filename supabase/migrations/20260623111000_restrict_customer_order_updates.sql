-- Prevent authenticated customers from minting or mutating privileged order state.
-- The existing own-order policies are intentionally broad for checkout and bank-transfer
-- submission, so enforce the actual customer boundary in triggers.

CREATE OR REPLACE FUNCTION public.prevent_customer_order_insert_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not allowed to create this order';
  END IF;

  IF COALESCE(NEW.payment_step::text, '') <> 'pending'
    OR COALESCE(NEW.order_status::text, '') <> 'awaiting_payment' THEN
    RAISE EXCEPTION 'customers can only create unpaid awaiting-payment orders';
  END IF;

  IF COALESCE(NEW.is_manual_order, false)
    OR COALESCE(NEW.is_from_quotation, false)
    OR COALESCE(NEW.is_from_special_quotation, false)
    OR COALESCE(NEW.auto_cancel_exempt, false)
    OR NEW.transfer_last5 IS NOT NULL
    OR NEW.admin_note IS NOT NULL THEN
    RAISE EXCEPTION 'customers cannot create privileged orders';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_customer_order_field_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() OR OLD.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not allowed to update this order';
  END IF;

  IF COALESCE(OLD.payment_step::text, '') NOT IN ('pending', 'submitted')
    OR COALESCE(NEW.payment_step::text, '') NOT IN ('pending', 'submitted') THEN
    RAISE EXCEPTION 'customers can only update pending bank-transfer orders';
  END IF;

  IF (to_jsonb(NEW) - 'payment_step' - 'transfer_last5' - 'updated_at')
    IS DISTINCT FROM
    (to_jsonb(OLD) - 'payment_step' - 'transfer_last5' - 'updated_at') THEN
    RAISE EXCEPTION 'customers can only update payment submission fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_customer_order_field_updates ON public.orders;
CREATE TRIGGER prevent_customer_order_field_updates
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_customer_order_field_updates();

DROP TRIGGER IF EXISTS prevent_customer_order_insert_escalation ON public.orders;
CREATE TRIGGER prevent_customer_order_insert_escalation
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_customer_order_insert_escalation();
