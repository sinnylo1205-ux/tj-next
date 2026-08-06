-- 喚醒觸發改為「取件日後 14 天」：擴充 source 允許值

ALTER TABLE public.customer_wakeup_drafts
  DROP CONSTRAINT IF EXISTS customer_wakeup_drafts_source_check;

ALTER TABLE public.customer_wakeup_drafts
  ADD CONSTRAINT customer_wakeup_drafts_source_check
  CHECK (source IN ('backfill', 'cron_30d', 'cron_14d_pickup', 'admin_compose'));

COMMENT ON COLUMN public.customer_wakeup_drafts.source IS
  'backfill=手動回填；cron_14d_pickup=取件日+14天排程；cron_30d=舊版訂購+30天；admin_compose=管理員手寫';
