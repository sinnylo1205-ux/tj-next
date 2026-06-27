-- Block authenticated customers from minting paid/privileged orders or
-- changing order fields outside the member payment-submission flow.

CREATE OR REPLACE FUNCTION public.prevent_customer_order_mutations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean;
  new_row jsonb;
  old_row jsonb;
BEGIN
  is_privileged :=
    COALESCE(auth.role(), '') = 'service_role'
    OR public.has_role(auth.uid(), 'admin'::public.app_role);

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  new_row := to_jsonb(NEW);

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'customers may only create their own orders';
    END IF;

    IF new_row->>'payment_step' IS DISTINCT FROM 'pending'
       OR new_row->>'order_status' IS DISTINCT FROM 'awaiting_payment' THEN
      RAISE EXCEPTION 'customers may only create awaiting-payment orders';
    END IF;

    IF COALESCE((new_row->>'is_manual_order')::boolean, false)
       OR COALESCE((new_row->>'is_from_quotation')::boolean, false)
       OR COALESCE((new_row->>'is_from_special_quotation')::boolean, false)
       OR COALESCE((new_row->>'auto_cancel_exempt')::boolean, false) THEN
      RAISE EXCEPTION 'customers may not create privileged orders';
    END IF;

    IF new_row->>'transfer_last5' IS NOT NULL
       OR new_row->>'admin_note' IS NOT NULL
       OR new_row->>'admin_verified_at' IS NOT NULL
       OR new_row->>'shipped_at' IS NOT NULL
       OR new_row->>'delivered_at' IS NOT NULL THEN
      RAISE EXCEPTION 'customers may not set privileged order fields';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    old_row := to_jsonb(OLD);

    IF (new_row - 'payment_step' - 'transfer_last5' - 'updated_at')
       IS DISTINCT FROM
       (old_row - 'payment_step' - 'transfer_last5' - 'updated_at') THEN
      RAISE EXCEPTION 'customers may only submit payment evidence';
    END IF;

    IF old_row->>'payment_step' NOT IN ('pending', 'submitted')
       OR new_row->>'payment_step' NOT IN ('pending', 'submitted') THEN
      RAISE EXCEPTION 'customers may not update verified orders';
    END IF;

    IF new_row->>'transfer_last5' IS NOT NULL
       AND new_row->>'payment_step' IS DISTINCT FROM 'submitted' THEN
      RAISE EXCEPTION 'transfer suffix requires submitted payment_step';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_customer_order_mutations ON public.orders;
CREATE TRIGGER prevent_customer_order_mutations
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_customer_order_mutations();
