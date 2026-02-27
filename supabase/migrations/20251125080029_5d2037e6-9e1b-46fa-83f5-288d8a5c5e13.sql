-- ✅ 修复 order_items 和 order_item_options 的 INSERT policy
-- 允许用户插入属于自己订单的 order_items 和 order_item_options

-- 为 order_items 添加用户 INSERT policy
CREATE POLICY "Users can insert their own order_items"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = order_items.order_id
    AND orders.user_id = auth.uid()
  )
);

-- 为 order_item_options 添加用户 INSERT policy
CREATE POLICY "Users can insert their own order_item_options"
ON public.order_item_options
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.order_items
    JOIN public.orders ON orders.id = order_items.order_id
    WHERE order_items.order_item_id = order_item_options.order_item_id
    AND orders.user_id = auth.uid()
  )
);