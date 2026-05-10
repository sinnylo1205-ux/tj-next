-- Customers may submit transfer details on their own pending orders, but must not
-- be able to mutate privileged order fields through the broad owner UPDATE RLS policy.
CREATE OR REPLACE FUNCTION public.prevent_customer_order_field_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = OLD.user_id THEN
    IF (to_jsonb(NEW) - 'payment_step' - 'transfer_last5' - 'updated_at')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'payment_step' - 'transfer_last5' - 'updated_at') THEN
      RAISE EXCEPTION 'Customers can only update payment submission fields on their own orders'
        USING ERRCODE = '42501';
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
