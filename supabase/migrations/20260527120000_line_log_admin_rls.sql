-- line_log：允許 admin 讀取（後台 LINE 對話視窗）
-- 表結構已存在於 Supabase，此 migration 僅補 RLS

ALTER TABLE public.line_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read line_log" ON public.line_log;
CREATE POLICY "Admins can read line_log"
  ON public.line_log FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
