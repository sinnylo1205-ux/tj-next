-- 為 products 表啟用 RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Products 是公開資料，所有人都可以查看
CREATE POLICY "Anyone can view products"
ON public.products
FOR SELECT
USING (true);

-- 只有管理員可以新增/修改商品（目前暫不實作，之後可以加入 admin 角色檢查）