-- customizer_uploads 定時清理：改為呼叫 Edge Function（使用 Storage API）
-- 每日 19:30 UTC 執行，刪除建立超過 60 天的檔案
-- 需已建立 vault secret cron_secret，且 Edge Function 已設定 CRON_SECRET

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-customizer-uploads-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-customizer-uploads');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'cleanup-customizer-uploads-daily',
  '30 19 * * *',
  $$
  SELECT net.http_post(
    url := 'https://akrxbdoxiopiubksgcrl.supabase.co/functions/v1/cleanup-customizer-uploads',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
