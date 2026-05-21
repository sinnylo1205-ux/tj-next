-- Customers may create checkout orders, but must not be able to mint privileged
-- order states or admin-only flags directly through the REST API.

CREATE OR REPLACE FUNCTION public.prevent_customer_order_unsafe_inserts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> NEW.user_id THEN
    RAISE EXCEPTION 'not allowed to create this order';
  END IF;

  IF NEW.payment_step::text IS DISTINCT FROM 'pending'
     OR NEW.order_status::text IS DISTINCT FROM 'awaiting_payment' THEN
    RAISE EXCEPTION 'customers can only create pending checkout orders';
  END IF;

  IF COALESCE(NEW.is_manual_order, false)
     OR COALESCE(NEW.is_from_quotation, false)
     OR COALESCE(NEW.is_from_special_quotation, false)
     OR COALESCE(NEW.auto_cancel_exempt, false) THEN
    RAISE EXCEPTION 'customers cannot set admin-only order flags';
  END IF;

  IF NEW.transfer_last5 IS NOT NULL OR NEW.admin_note IS NOT NULL THEN
    RAISE EXCEPTION 'customers cannot set privileged order fields on insert';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_customer_order_unsafe_inserts ON public.orders;
CREATE TRIGGER prevent_customer_order_unsafe_inserts
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_customer_order_unsafe_inserts();
