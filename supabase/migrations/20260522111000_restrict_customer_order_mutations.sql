-- Prevent authenticated customers from directly mutating privileged order state.
-- Existing RLS lets owners update/insert their own rows; these triggers keep the
-- browser checkout/member flows working while blocking forged admin/status data.

CREATE OR REPLACE FUNCTION public.is_order_privileged_actor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.role() = 'service_role'
    OR public.has_role(auth.uid(), 'admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.prevent_customer_order_field_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_row jsonb := to_jsonb(OLD);
  new_row jsonb := to_jsonb(NEW);
  allowed_customer_keys text[] := ARRAY['payment_step', 'transfer_last5', 'updated_at'];
BEGIN
  IF public.is_order_privileged_actor() THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL
    OR old_row->>'user_id' IS DISTINCT FROM auth.uid()::text
    OR new_row->>'user_id' IS DISTINCT FROM auth.uid()::text
  THEN
    RAISE EXCEPTION 'Customers may only update their own order payment submission fields';
  END IF;

  IF (new_row - allowed_customer_keys) IS DISTINCT FROM (old_row - allowed_customer_keys) THEN
    RAISE EXCEPTION 'Customers may not update privileged order fields';
  END IF;

  IF COALESCE(old_row->>'payment_step', '') NOT IN ('pending', 'submitted')
    OR COALESCE(new_row->>'payment_step', '') NOT IN ('pending', 'submitted')
  THEN
    RAISE EXCEPTION 'Customers may only submit pending bank-transfer payment details';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_customer_order_field_updates ON public.orders;
CREATE TRIGGER prevent_customer_order_field_updates
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_customer_order_field_updates();

CREATE OR REPLACE FUNCTION public.prevent_customer_privileged_order_inserts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_row jsonb := to_jsonb(NEW);
BEGIN
  IF public.is_order_privileged_actor() THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR new_row->>'user_id' IS DISTINCT FROM auth.uid()::text THEN
    RAISE EXCEPTION 'Customers may only create orders for themselves';
  END IF;

  IF new_row->>'payment_step' IS DISTINCT FROM 'pending'
    OR new_row->>'order_status' IS DISTINCT FROM 'awaiting_payment'
  THEN
    RAISE EXCEPTION 'Customers may only create orders awaiting payment';
  END IF;

  IF COALESCE((new_row->>'is_manual_order')::boolean, false)
    OR COALESCE((new_row->>'is_from_quotation')::boolean, false)
    OR COALESCE((new_row->>'is_from_special_quotation')::boolean, false)
    OR COALESCE((new_row->>'auto_cancel_exempt')::boolean, false)
    OR COALESCE((new_row->>'is_hide')::boolean, false)
  THEN
    RAISE EXCEPTION 'Customers may not create admin or quotation orders';
  END IF;

  IF NULLIF(new_row->>'transfer_last5', '') IS NOT NULL
    OR NULLIF(new_row->>'admin_note', '') IS NOT NULL
    OR NULLIF(new_row->>'admin_media_urls', '') IS NOT NULL
    OR NULLIF(new_row->>'admin_verified_at', '') IS NOT NULL
    OR NULLIF(new_row->>'shipped_at', '') IS NOT NULL
    OR NULLIF(new_row->>'delivered_at', '') IS NOT NULL
  THEN
    RAISE EXCEPTION 'Customers may not create orders with privileged admin fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_customer_privileged_order_inserts ON public.orders;
CREATE TRIGGER prevent_customer_privileged_order_inserts
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_customer_privileged_order_inserts();
