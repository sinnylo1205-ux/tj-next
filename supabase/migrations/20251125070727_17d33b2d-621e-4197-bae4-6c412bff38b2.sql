-- ============================================
-- Stage 1: 安全性修正 - 建立 user_roles 系統
-- ============================================

-- 1. 創建角色 enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'consumer');

-- 2. 創建 user_roles 表
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, role)
);

-- 3. 啟用 RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. 創建 RLS policies
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- 5. 創建 security definer 函數檢查角色
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 6. 遷移現有的 role 資料到 user_roles 表
INSERT INTO public.user_roles (user_id, role)
SELECT id, role::public.app_role
FROM public.user_log_in
WHERE role IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- ============================================
-- Stage 2: 刪除依賴 user_log_in.role 的 policies
-- ============================================

-- 刪除 orders 的舊 policies
DROP POLICY IF EXISTS "Users can read their own orders or admins all" ON public.orders;
DROP POLICY IF EXISTS "Admins or service_role can update orders" ON public.orders;
DROP POLICY IF EXISTS "Admins or service_role can delete orders" ON public.orders;
DROP POLICY IF EXISTS "Users can update limited fields on their own orders" ON public.orders;

-- 刪除 order_items 的舊 policies
DROP POLICY IF EXISTS "Users can read their own order_items or admins all" ON public.order_items;
DROP POLICY IF EXISTS "Admins or service_role can insert order_items" ON public.order_items;
DROP POLICY IF EXISTS "Admins or service_role can update order_items" ON public.order_items;
DROP POLICY IF EXISTS "Admins or service_role can delete order_items" ON public.order_items;

-- 刪除 order_item_options 的舊 policies
DROP POLICY IF EXISTS "Users can read their own order_item_options or admins all" ON public.order_item_options;
DROP POLICY IF EXISTS "Admins or service_role can insert order_item_options" ON public.order_item_options;
DROP POLICY IF EXISTS "Admins or service_role can update order_item_options" ON public.order_item_options;
DROP POLICY IF EXISTS "Admins or service_role can delete order_item_options" ON public.order_item_options;

-- ============================================
-- Stage 3: 刪除 user_log_in.role 欄位
-- ============================================

ALTER TABLE public.user_log_in DROP COLUMN IF EXISTS role;

-- ============================================
-- Stage 4: 更新 handle_new_user trigger 函數
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 插入 user_log_in
  INSERT INTO public.user_log_in (id, name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone', '')
  );
  
  -- 插入預設 consumer 角色到 user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'consumer'::public.app_role);
  
  RETURN NEW;
END;
$$;

-- ============================================
-- Stage 5: 創建新的 RLS policies（使用 has_role 函數）
-- ============================================

-- 創建新的 orders policies
CREATE POLICY "Users can read their own orders or admins all"
  ON public.orders FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR public.has_role(auth.uid(), 'admin')
    OR user_id = auth.uid()
  );

CREATE POLICY "Admins or service_role can update orders"
  ON public.orders FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins or service_role can delete orders"
  ON public.orders FOR DELETE
  USING (
    auth.role() = 'service_role'
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users can update limited fields on their own orders"
  ON public.orders FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id 
    AND payment_step = ANY (ARRAY['pending'::payment_step_enum, 'submitted'::payment_step_enum])
  );

-- 創建新的 order_items policies
CREATE POLICY "Users can read their own order_items or admins all"
  ON public.order_items FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
      AND orders.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins or service_role can insert order_items"
  ON public.order_items FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins or service_role can update order_items"
  ON public.order_items FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins or service_role can delete order_items"
  ON public.order_items FOR DELETE
  USING (
    auth.role() = 'service_role'
    OR public.has_role(auth.uid(), 'admin')
  );

-- 創建新的 order_item_options policies
CREATE POLICY "Users can read their own order_item_options or admins all"
  ON public.order_item_options FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.order_items
      JOIN public.orders ON orders.id = order_items.order_id
      WHERE order_items.order_item_id = order_item_options.order_item_id
      AND orders.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins or service_role can insert order_item_options"
  ON public.order_item_options FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins or service_role can update order_item_options"
  ON public.order_item_options FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins or service_role can delete order_item_options"
  ON public.order_item_options FOR DELETE
  USING (
    auth.role() = 'service_role'
    OR public.has_role(auth.uid(), 'admin')
  );

-- ============================================
-- Stage 6: 更新 cart 表結構
-- ============================================

-- 新增 expected_pickup_date 欄位
ALTER TABLE public.cart 
ADD COLUMN IF NOT EXISTS expected_pickup_date DATE;

-- 新增 linked_item_id 欄位（用於包裝設計關聯甜點）
ALTER TABLE public.cart
ADD COLUMN IF NOT EXISTS linked_item_id UUID REFERENCES public.cart(id) ON DELETE SET NULL;

-- 新增 is_package_design 欄位
ALTER TABLE public.cart
ADD COLUMN IF NOT EXISTS is_package_design BOOLEAN DEFAULT false;

-- ============================================
-- Stage 7: 更新 orders 表結構
-- ============================================

-- 新增 expected_pickup_date 欄位
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS expected_pickup_date DATE;

-- 新增 notes 欄位
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS notes TEXT;

-- 新增 subtotal 欄位（商品小計，不含運費）
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10, 2) DEFAULT 0.00;

-- ============================================
-- Stage 8: 更新 order_items 表結構
-- ============================================

-- 新增 is_package_design 欄位
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS is_package_design BOOLEAN DEFAULT false;

-- 新增 linked_item_id 欄位（用於包裝設計關聯甜點）
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS linked_item_id INTEGER REFERENCES public.order_items(order_item_id) ON DELETE SET NULL;

-- 新增 preview_url 欄位
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS preview_url TEXT;

-- 新增 customizations_json 欄位
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS customizations_json JSONB;

-- 新增 quantity_description 欄位（用於包裝設計數量描述）
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS quantity_description TEXT;

-- ============================================
-- Stage 9: 創建 user_addresses 表
-- ============================================

CREATE TABLE IF NOT EXISTS public.user_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  address TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 啟用 RLS
ALTER TABLE public.user_addresses ENABLE ROW LEVEL SECURITY;

-- 創建 RLS policies
CREATE POLICY "Users can view their own addresses"
  ON public.user_addresses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own addresses"
  ON public.user_addresses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own addresses"
  ON public.user_addresses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own addresses"
  ON public.user_addresses FOR DELETE
  USING (auth.uid() = user_id);

-- 創建 updated_at trigger
CREATE TRIGGER update_user_addresses_updated_at
  BEFORE UPDATE ON public.user_addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();