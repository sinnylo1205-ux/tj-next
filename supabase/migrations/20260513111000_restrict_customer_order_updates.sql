CREATE OR REPLACE FUNCTION public.prevent_customer_order_field_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_customer_order_fields text[] := ARRAY[
    'payment_step',
    'transfer_last5',
    'updated_at'
  ];
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - allowed_customer_order_fields)
    IS DISTINCT FROM
    (to_jsonb(OLD) - allowed_customer_order_fields)
  THEN
    RAISE EXCEPTION 'Customers can only update payment submission fields on orders'
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
