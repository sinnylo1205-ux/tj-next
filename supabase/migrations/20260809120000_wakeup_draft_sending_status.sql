-- Allow exclusive send claim: pending/approved/failed → sending → sent|failed

ALTER TABLE public.customer_wakeup_drafts
  DROP CONSTRAINT IF EXISTS customer_wakeup_drafts_status_check;

ALTER TABLE public.customer_wakeup_drafts
  ADD CONSTRAINT customer_wakeup_drafts_status_check
  CHECK (status IN ('pending_review', 'approved', 'sending', 'sent', 'dismissed', 'failed'));

COMMENT ON COLUMN public.customer_wakeup_drafts.status IS
  'pending_review=待審；approved=已核准；sending=發送中（互斥 claim）；sent=已發送；dismissed=略過；failed=失敗可重試';
