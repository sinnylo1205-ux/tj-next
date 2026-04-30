-- Prevent customers from using the broad "own order" UPDATE policy to mutate
-- staff-controlled order fields such as order_status.
CREATE OR REPLACE FUNCTION public.prevent_customer_order_field_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = OLD.user_id THEN
    IF (to_jsonb(NEW) - 'payment_step' - 'transfer_last5' - 'updated_at')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'payment_step' - 'transfer_last5' - 'updated_at') THEN
      RAISE EXCEPTION 'Customers may only submit payment information for their own orders';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_customer_order_field_updates ON public.orders;
CREATE TRIGGER prevent_customer_order_field_updates
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_customer_order_field_updates();
