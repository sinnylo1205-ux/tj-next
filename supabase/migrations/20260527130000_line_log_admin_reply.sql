-- line_log：記錄後台管理員手動回覆
ALTER TABLE public.line_log
  ADD COLUMN IF NOT EXISTS admin_reply text;

COMMENT ON COLUMN public.line_log.admin_reply IS '後台管理員透過 admin-line-reply 送出的文字';
