-- 資安修復：customer_360 view（消除 Security Definer / UNRESTRICTED 警告）
--
-- 問題：
--   1) customer_360 預設以建立者（postgres）權限執行（Security Definer 行為），
--      查詢時會繞過底層 chat_state / orders / user_log_in 的 RLS。
--   2) 又 GRANT SELECT TO authenticated，導致任何登入者都能讀全部客戶個資。
--
-- 修復：
--   A) view 改用 security_invoker（以查詢者本人權限執行，RLS 才會生效）。
--   B) 三張底層表開啟 RLS，補上 admin 全權限 + 會員自助政策。
--
-- 盤點（瀏覽器端對三張表的存取）：
--   - chat_state ：僅 admin 後台讀寫（會員/anon 不碰）
--   - orders     ：admin 後台讀寫；會員結帳 insert 並讀回自己的訂單
--   - user_log_in：admin 後台讀寫；會員讀/改自己（id = auth.uid()）
--   - 其餘後端 / edge functions 皆走 service_role，不受 RLS 影響。

-- A) view 以查詢者身分執行
ALTER VIEW public.customer_360 SET (security_invoker = on);

-- 確保查詢者（authenticated）擁有底層表的 table-level SELECT 權限，
-- 實際可見的列仍由下方 RLS 控制。
GRANT SELECT ON public.chat_state TO authenticated;
GRANT SELECT ON public.orders TO authenticated;
GRANT SELECT ON public.user_log_in TO authenticated;

-- B-1) chat_state：僅 admin
ALTER TABLE public.chat_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage chat_state" ON public.chat_state;
CREATE POLICY "Admins can manage chat_state"
  ON public.chat_state FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- B-2) orders：admin 全權限 + 會員自助（讀/新增自己的訂單）
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage orders" ON public.orders;
CREATE POLICY "Admins can manage orders"
  ON public.orders FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Members can read own orders" ON public.orders;
CREATE POLICY "Members can read own orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Members can create own orders" ON public.orders;
CREATE POLICY "Members can create own orders"
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- B-3) user_log_in：admin 全權限 + 會員讀/改自己
ALTER TABLE public.user_log_in ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage user_log_in" ON public.user_log_in;
CREATE POLICY "Admins can manage user_log_in"
  ON public.user_log_in FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Members can read own profile" ON public.user_log_in;
CREATE POLICY "Members can read own profile"
  ON public.user_log_in FOR SELECT
  TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Members can update own profile" ON public.user_log_in;
CREATE POLICY "Members can update own profile"
  ON public.user_log_in FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
