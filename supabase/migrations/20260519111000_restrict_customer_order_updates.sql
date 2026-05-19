-- Prevent customers from using the broad own-order UPDATE policy to mutate
-- privileged order fields while reporting payment details.
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

  IF auth.uid() IS NULL OR OLD.user_id IS DISTINCT FROM auth.uid() OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Customers may only update their own payment submission fields';
  END IF;

  IF (to_jsonb(NEW) - ARRAY['payment_step', 'transfer_last5', 'updated_at'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['payment_step', 'transfer_last5', 'updated_at']) THEN
    RAISE EXCEPTION 'Customers may only update payment_step and transfer_last5';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_customer_order_field_updates ON public.orders;
CREATE TRIGGER prevent_customer_order_field_updates
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_customer_order_field_updates();
