-- Prevent customers from mutating privileged order fields through the broad
-- owner UPDATE policy. Customers may only submit bank-transfer metadata.
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

  IF auth.uid() IS NULL OR OLD.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not allowed to update this order'
      USING ERRCODE = '42501';
  END IF;

  IF (to_jsonb(NEW) - 'payment_step' - 'transfer_last5' - 'updated_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'payment_step' - 'transfer_last5' - 'updated_at') THEN
    RAISE EXCEPTION 'customers may only update payment submission fields'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.payment_step IS DISTINCT FROM OLD.payment_step
     AND NEW.payment_step NOT IN ('pending'::public.payment_step_enum, 'submitted'::public.payment_step_enum) THEN
    RAISE EXCEPTION 'customers cannot verify payments'
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
