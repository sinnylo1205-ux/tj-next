-- 為 cart 表啟用 RLS
ALTER TABLE public.cart ENABLE ROW LEVEL SECURITY;

-- Cart RLS 政策：用戶只能查看和管理自己的購物車
CREATE POLICY "Users can view their own cart"
ON public.cart
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert into their own cart"
ON public.cart
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cart"
ON public.cart
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete from their own cart"
ON public.cart
FOR DELETE
USING (auth.uid() = user_id);

-- 建立 orders 表
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  items JSONB NOT NULL,
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 為 orders 表啟用 RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Orders RLS 政策
CREATE POLICY "Users can view their own orders"
ON public.orders
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own orders"
ON public.orders
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 為 orders 表添加 updated_at 觸發器
CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();