-- 取件日後 14 天喚醒草稿：每日一次呼叫 Edge Function
--
-- 部署前請確認 vault 已有 cron_secret（與 Edge CRON_SECRET 一致）：
--   SELECT vault.create_secret('YOUR_CRON_SECRET', 'cron_secret');

DO $$
BEGIN
  PERFORM cron.unschedule('wakeup-draft-cron');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'wakeup-draft-cron',
  '15 10 * * *',  -- 每日 10:15（UTC+8 約 18:15；可依需求調整）
  $$
  SELECT net.http_post(
    url := 'https://akrxbdoxiopiubksgcrl.supabase.co/functions/v1/wakeup-draft-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
