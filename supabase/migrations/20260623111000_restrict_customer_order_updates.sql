-- Prevent authenticated customers from mutating privileged order fields before payment.
-- The existing own-order UPDATE policy is intentionally broad for bank-transfer submission,
-- so enforce the actual column whitelist in a trigger.

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
