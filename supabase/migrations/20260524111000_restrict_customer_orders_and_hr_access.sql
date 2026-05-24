-- Critical RLS hardening:
-- 1. Customers must not be able to mint paid/processing/admin orders or change financial/status fields directly.
-- 2. HR tables contain internal staff data and must not be readable/writable by every signed-in customer.

CREATE OR REPLACE FUNCTION public.prevent_customer_order_privileged_mutations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_payload jsonb;
  old_payload jsonb;
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to mutate orders';
  END IF;

  IF TG_OP = 'INSERT' THEN
    new_payload := to_jsonb(NEW);

    IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Customers can only create their own orders';
    END IF;

    IF NEW.payment_step::text IS DISTINCT FROM 'pending'
      OR NEW.order_status::text IS DISTINCT FROM 'awaiting_payment' THEN
      RAISE EXCEPTION 'Customer orders must start as pending and awaiting payment';
    END IF;

    IF COALESCE((new_payload->>'is_manual_order')::boolean, false)
      OR COALESCE((new_payload->>'is_from_quotation')::boolean, false)
      OR COALESCE((new_payload->>'is_from_special_quotation')::boolean, false)
      OR COALESCE((new_payload->>'auto_cancel_exempt')::boolean, false)
      OR COALESCE((new_payload->>'is_hide')::boolean, false) THEN
      RAISE EXCEPTION 'Customers cannot set admin-only order flags';
    END IF;

    IF NULLIF(new_payload->>'transfer_last5', '') IS NOT NULL
      OR NULLIF(new_payload->>'admin_note', '') IS NOT NULL
      OR NULLIF(new_payload->>'admin_verified_at', '') IS NOT NULL
      OR NULLIF(new_payload->>'confirmed_at', '') IS NOT NULL
      OR NULLIF(new_payload->>'paid_at', '') IS NOT NULL
      OR NULLIF(new_payload->>'shipped_at', '') IS NOT NULL
      OR NULLIF(new_payload->>'delivered_at', '') IS NOT NULL THEN
      RAISE EXCEPTION 'Customers cannot set privileged order fields on insert';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR OLD.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Customers can only update their own orders';
    END IF;

    new_payload := to_jsonb(NEW) - 'updated_at' - 'payment_step' - 'transfer_last5';
    old_payload := to_jsonb(OLD) - 'updated_at' - 'payment_step' - 'transfer_last5';

    IF new_payload IS DISTINCT FROM old_payload THEN
      RAISE EXCEPTION 'Customers can only update payment submission fields';
    END IF;

    IF NEW.payment_step::text NOT IN ('pending', 'submitted') THEN
      RAISE EXCEPTION 'Customers cannot verify or advance payment status';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_customer_order_privileged_mutations ON public.orders;
CREATE TRIGGER prevent_customer_order_privileged_mutations
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_customer_order_privileged_mutations();

ALTER TABLE public.hr_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users full access on hr_schedule" ON public.hr_schedule;
DROP POLICY IF EXISTS "Authenticated users full access on hr_leaves" ON public.hr_leaves;
DROP POLICY IF EXISTS "Authenticated users full access on hr_notes" ON public.hr_notes;
DROP POLICY IF EXISTS "Admins can manage hr_schedule" ON public.hr_schedule;
DROP POLICY IF EXISTS "Admins can manage hr_leaves" ON public.hr_leaves;
DROP POLICY IF EXISTS "Admins can manage hr_notes" ON public.hr_notes;

CREATE POLICY "Admins can manage hr_schedule"
  ON public.hr_schedule FOR ALL
  USING (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage hr_leaves"
  ON public.hr_leaves FOR ALL
  USING (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage hr_notes"
  ON public.hr_notes FOR ALL
  USING (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'));
