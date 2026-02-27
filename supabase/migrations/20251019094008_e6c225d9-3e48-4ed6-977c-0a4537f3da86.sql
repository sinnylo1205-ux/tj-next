-- ✅ 一、確保 products 表的 id 是 primary key
ALTER TABLE public.products 
DROP CONSTRAINT IF EXISTS products_pkey;

ALTER TABLE public.products 
ADD CONSTRAINT products_pkey PRIMARY KEY (id);

-- 插入三筆測試商品資料
INSERT INTO public.products (name, category, price, description, emoji)
VALUES 
  ('星空瑪德蓮禮盒', '活動禮盒', 350, '浪漫星空主題，精緻瑪德蓮組合', '⭐'),
  ('花朵瑪德蓮禮盒', '活動禮盒', 320, '優雅花卉設計，甜蜜贈禮首選', '🌸'),
  ('客製化禮盒', '活動禮盒', 450, '專屬設計，打造獨一無二的禮盒', '🎁')
ON CONFLICT (id) DO NOTHING;

-- ✅ 二、修改 cart 資料表結構

-- 先刪除 cart 中無效的資料（product_id 不存在於 products 表）
DELETE FROM public.cart 
WHERE product_id NOT IN (SELECT id FROM public.products);

-- 刪除不需要的欄位
ALTER TABLE public.cart 
DROP COLUMN IF EXISTS product_name,
DROP COLUMN IF EXISTS user_name,
DROP COLUMN IF EXISTS dded_at;

-- 確保 created_at 欄位存在
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cart' 
    AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.cart ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT now();
  END IF;
END $$;

-- 確保 product_id 不可為空
ALTER TABLE public.cart 
ALTER COLUMN product_id SET NOT NULL;

-- ✅ 三、建立外鍵關聯

-- 建立 product_id 的外鍵關聯
ALTER TABLE public.cart
DROP CONSTRAINT IF EXISTS cart_product_id_fkey;

ALTER TABLE public.cart
ADD CONSTRAINT cart_product_id_fkey 
FOREIGN KEY (product_id) 
REFERENCES public.products(id) 
ON DELETE CASCADE;

-- 建立 user_id 的外鍵關聯（關聯到 auth.users）
ALTER TABLE public.cart
DROP CONSTRAINT IF EXISTS cart_user_id_fkey;

ALTER TABLE public.cart
ADD CONSTRAINT cart_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES auth.users(id) 
ON DELETE CASCADE;

-- 建立索引以提升查詢效能
CREATE INDEX IF NOT EXISTS idx_cart_user_id ON public.cart(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_product_id ON public.cart(product_id);
CREATE INDEX IF NOT EXISTS idx_cart_temp_id ON public.cart(temp_id);