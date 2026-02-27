-- ✅ 修复 orders 表缺少 INSERT policy 的问题
-- 允许已认证用户插入自己的订单

CREATE POLICY "Users can insert their own orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- ✅ 同时确保 order_items 和 order_item_options 也有正确的 INSERT policies
-- 检查并创建 order_items INSERT policy（如果不存在）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'order_items' 
    AND policyname = 'Admins or service_role can insert order_items'
    AND cmd = 'INSERT'
  ) THEN
    -- 已存在，不需要重复创建
    RAISE NOTICE 'order_items INSERT policy already exists';
  END IF;
END $$;

-- 检查 order_item_options INSERT policy（如果不存在）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'order_item_options' 
    AND policyname = 'Admins or service_role can insert order_item_options'
    AND cmd = 'INSERT'
  ) THEN
    RAISE NOTICE 'order_item_options INSERT policy already exists';
  END IF;
END $$;