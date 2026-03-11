-- chat_state：實際表結構為 line_user_id (text), display_name, note, reply_mode, updated
-- 僅為既有表加上 RLS 政策，不建立表

-- 為 chat_state 啟用 RLS
ALTER TABLE public.chat_state ENABLE ROW LEVEL SECURITY;

-- 允許 admin 讀取
DROP POLICY IF EXISTS "Admins can read chat_state" ON public.chat_state;
CREATE POLICY "Admins can read chat_state"
  ON public.chat_state FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- 允許 admin 更新（含 reply_mode 等欄位）
DROP POLICY IF EXISTS "Admins can update chat_state" ON public.chat_state;
CREATE POLICY "Admins can update chat_state"
  ON public.chat_state FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 允許 admin 新增（若後台會建立筆數）
DROP POLICY IF EXISTS "Admins can insert chat_state" ON public.chat_state;
CREATE POLICY "Admins can insert chat_state"
  ON public.chat_state FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
