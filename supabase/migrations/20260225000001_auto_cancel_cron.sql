-- 24 小時逾時訂單自動取消：使用 pg_cron + pg_net 呼叫 Edge Function
-- 每小時整點執行一次
--
-- 部署前請先在 Supabase SQL Editor 執行（將 YOUR_CRON_SECRET 換成實際密鑰）：
--   SELECT vault.create_secret('YOUR_CRON_SECRET', 'cron_secret');
-- 密鑰需與 Edge Function 環境變數 CRON_SECRET 一致

DO $$
BEGIN
  PERFORM cron.unschedule('auto-cancel-expired-orders');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'auto-cancel-expired-orders',
  '0 * * * *',  -- 每小時整點執行一次
  $$
  SELECT net.http_post(
    url := 'https://akrxbdoxiopiubksgcrl.supabase.co/functions/v1/auto-cancel-expired-orders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
