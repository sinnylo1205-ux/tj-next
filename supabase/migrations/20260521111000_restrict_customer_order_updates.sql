-- Prevent customers from using broad UPDATE RLS policies to mutate privileged order fields.
-- RLS decides which rows a customer may touch; this trigger decides which columns they may change.

DROP POLICY IF EXISTS "Users can update payment method for their pending orders" ON public.orders;

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
    RAISE EXCEPTION 'not allowed to update this order';
  END IF;

  IF (to_jsonb(NEW) - 'payment_step' - 'transfer_last5' - 'updated_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'payment_step' - 'transfer_last5' - 'updated_at') THEN
    RAISE EXCEPTION 'customers can only update payment_step and transfer_last5';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_customer_order_field_updates ON public.orders;
CREATE TRIGGER prevent_customer_order_field_updates
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_customer_order_field_updates();
