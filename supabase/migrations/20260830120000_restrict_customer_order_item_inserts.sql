-- 顧客不得對已付款／製作中訂單追加 order_items。
--
-- 背景：
--   "Users can insert their own order_items" 只檢查 orders.user_id = auth.uid()，
--   未限制 payment_step / order_status。持有 JWT 的會員可用 PostgREST
--   對已付款訂單插入 unit_price = 0 的品項，後台仍會當正式訂單履約。
--   PR #21/#24 鎖住 orders 欄位（含 total_amount），反而讓「鎖總額、加免費品項」
--   成為剩餘攻擊面。結帳 handleSubmitOrder 在 pending / awaiting_payment 時插入品項，
--   該窗口必須保留。

CREATE OR REPLACE FUNCTION public.customer_can_insert_order_lines(_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = _order_id
      AND o.user_id = auth.uid()
      AND o.payment_step = 'pending'::payment_step_enum
      AND o.order_status = 'awaiting_payment'::order_status_enum
  );
$$;

COMMENT ON FUNCTION public.customer_can_insert_order_lines(uuid) IS
  '顧客僅能在自己的待付款訂單（pending / awaiting_payment）寫入 order_items／options';

REVOKE ALL ON FUNCTION public.customer_can_insert_order_lines(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_can_insert_order_lines(uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can insert their own order_items" ON public.order_items;
CREATE POLICY "Users can insert their own order_items"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (public.customer_can_insert_order_lines(order_id));

DROP POLICY IF EXISTS "Users can insert their own order_item_options" ON public.order_item_options;
CREATE POLICY "Users can insert their own order_item_options"
ON public.order_item_options
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.order_items oi
    WHERE oi.order_item_id = order_item_options.order_item_id
      AND public.customer_can_insert_order_lines(oi.order_id)
  )
);
