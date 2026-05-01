-- Prevent customers from abusing the broad owner UPDATE policy to change
-- privileged order fields such as order_status or total_amount.
CREATE OR REPLACE FUNCTION public.prevent_customer_order_field_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'authenticated'
     AND NEW.user_id = auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin')
  THEN
    IF (to_jsonb(NEW) - 'payment_step' - 'transfer_last5' - 'updated_at')
       IS NOT DISTINCT FROM
       (to_jsonb(OLD) - 'payment_step' - 'transfer_last5' - 'updated_at')
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Customers may only update payment_step, transfer_last5, and updated_at on their own orders'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_customer_order_field_updates ON public.orders;
CREATE TRIGGER prevent_customer_order_field_updates
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_customer_order_field_updates();
