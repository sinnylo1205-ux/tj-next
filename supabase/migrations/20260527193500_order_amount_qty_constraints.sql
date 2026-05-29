-- Harden payment data integrity:
-- 1) order total must be positive
-- 2) order item quantity must be at least 1

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_total_amount_positive_chk'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_total_amount_positive_chk
      CHECK (total_amount > 0) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'order_items_quantity_positive_chk'
  ) THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_quantity_positive_chk
      CHECK (quantity >= 1) NOT VALID;
  END IF;
END
$$;
