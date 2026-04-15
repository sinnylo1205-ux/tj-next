-- 明確拒絕 anon 角色讀寫訂單相關表（defense in depth）
-- 背景：20260114060803 曾移除 RESTRICTIVE「必須已登入」；理論上 permissive 的
-- user_id = auth.uid() 在 anon 時不應匹配任何列，但若 RLS 被關閉、誤加寬鬆 policy、
-- 或環境差異，仍可能洩漏個資。此遷移強制開啟 RLS 並對 anon 使用 RESTRICTIVE + false。

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_cannot_access_orders" ON public.orders;
CREATE POLICY "anon_cannot_access_orders"
  ON public.orders
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "anon_cannot_access_order_items" ON public.order_items;
CREATE POLICY "anon_cannot_access_order_items"
  ON public.order_items
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "anon_cannot_access_order_item_options" ON public.order_item_options;
CREATE POLICY "anon_cannot_access_order_item_options"
  ON public.order_item_options
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);
