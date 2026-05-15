-- Prevent customers from using the broad own-order UPDATE policy to mutate
-- privileged order fields while submitting payment information.
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

  IF auth.uid() IS NULL OR auth.uid() <> OLD.user_id THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - ARRAY['payment_step', 'transfer_last5', 'updated_at'])
    IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['payment_step', 'transfer_last5', 'updated_at'])
  THEN
    RAISE EXCEPTION 'customers may only update payment submission fields on their own orders'
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
