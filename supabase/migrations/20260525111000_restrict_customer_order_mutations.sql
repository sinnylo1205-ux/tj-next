-- Protect privileged order fields from direct customer writes.
-- RLS can decide which rows a customer may update, but it cannot limit columns.

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
    RAISE EXCEPTION 'not allowed to update this order';
  END IF;

  IF NEW.total_amount IS DISTINCT FROM OLD.total_amount
    OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
    OR NEW.shipping_fee IS DISTINCT FROM OLD.shipping_fee
    OR NEW.shipping_way IS DISTINCT FROM OLD.shipping_way
    OR NEW.shipping_address_text IS DISTINCT FROM OLD.shipping_address_text
    OR NEW.who_receive IS DISTINCT FROM OLD.who_receive
    OR NEW.recipient_name IS DISTINCT FROM OLD.recipient_name
    OR NEW.phone IS DISTINCT FROM OLD.phone
    OR NEW.notes IS DISTINCT FROM OLD.notes
    OR NEW.expected_pickup_date IS DISTINCT FROM OLD.expected_pickup_date
    OR NEW."Email" IS DISTINCT FROM OLD."Email"
    OR NEW."TAX_id" IS DISTINCT FROM OLD."TAX_id"
    OR NEW."TAX_title" IS DISTINCT FROM OLD."TAX_title"
    OR NEW.order_status IS DISTINCT FROM OLD.order_status
    OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
    OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
    OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
    OR NEW.is_manual_order IS DISTINCT FROM OLD.is_manual_order
    OR NEW.merchant_confirmed IS DISTINCT FROM OLD.merchant_confirmed
    OR NEW.admin_verified_at IS DISTINCT FROM OLD.admin_verified_at
    OR NEW.shipped_at IS DISTINCT FROM OLD.shipped_at
    OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
    OR NEW.is_from_quotation IS DISTINCT FROM OLD.is_from_quotation
    OR NEW.is_from_special_quotation IS DISTINCT FROM OLD.is_from_special_quotation
    OR NEW.auto_cancel_exempt IS DISTINCT FROM OLD.auto_cancel_exempt
    OR NEW.admin_note IS DISTINCT FROM OLD.admin_note
    OR NEW.customer_type IS DISTINCT FROM OLD.customer_type
    OR NEW.orderer_name IS DISTINCT FROM OLD.orderer_name
    OR NEW.admin_media_urls IS DISTINCT FROM OLD.admin_media_urls
    OR NEW.line_user_id IS DISTINCT FROM OLD.line_user_id
    OR NEW.items IS DISTINCT FROM OLD.items
    OR NEW.status IS DISTINCT FROM OLD.status
  THEN
    RAISE EXCEPTION 'customers may only update payment_step and transfer_last5';
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
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not allowed to create this order';
  END IF;

  IF NEW.payment_step IS DISTINCT FROM 'pending'::payment_step_enum
    OR NEW.order_status IS DISTINCT FROM 'awaiting_payment'::order_status_enum
    OR COALESCE(NEW.is_manual_order, false)
    OR COALESCE(NEW.is_from_quotation, false)
    OR COALESCE(NEW.is_from_special_quotation, false)
    OR COALESCE(NEW.auto_cancel_exempt, false)
    OR NEW.transfer_last5 IS NOT NULL
    OR NEW.admin_note IS NOT NULL
    OR NEW.admin_verified_at IS NOT NULL
    OR NEW.shipped_at IS NOT NULL
    OR NEW.delivered_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'customers cannot create privileged order states';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_customer_privileged_order_inserts ON public.orders;
CREATE TRIGGER prevent_customer_privileged_order_inserts
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_customer_privileged_order_inserts();
