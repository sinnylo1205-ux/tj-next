-- =============================================================================
-- admin-reports Edge Function：pg_cron + pg_net
-- =============================================================================
--
-- 【CRON_SECRET】與 Edge Functions Secrets 中既有 CRON_SECRET 相同即可，不必另建一組。
--
-- 【月度改為每月 28 日（UTC）】
-- 各曆月都有 28 號，含 2 月，不需再為平／閏年寫特例。
--
-- 【年度仍為 12/30（UTC）】
-- 若 pg_cron「只」在每月 28 日呼叫，12/30 年度報告不會被叫到，需另加一條 12/30 排程；
-- 或改用下方【選項 C】每日呼叫一次，由函式內判斷 28 與 12/30。
--
-- 【操作】Database → Extensions 啟用 pg_cron、pg_net → SQL Editor 替換占位符後執行。
--
-- 【取消排程】
--   SELECT cron.unschedule('admin-reports-monthly-28');
--   SELECT cron.unschedule('admin-reports-yearly-dec30');
--
-- =============================================================================
-- 選項 A（建議）：兩條排程——每月 28 送月度、12/30 送年度
-- =============================================================================

SELECT cron.schedule(
  'admin-reports-monthly-28',
  '0 2 28 * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/admin-reports',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'YOUR_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- =============================================================================
-- 選項 C：每日 UTC 02:00 呼叫一次（懶人版；函式內僅在 28 日與 12/30 真的送 webhook）
-- =============================================================================
--
-- SELECT cron.schedule(
--   'admin-reports-daily',
--   '0 2 * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/admin-reports',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'x-cron-secret', 'YOUR_CRON_SECRET'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
