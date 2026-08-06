-- 會員喚醒草稿：訂後 30 天關懷（審核後發送）

ALTER TABLE public.order_customer_crm
  ADD COLUMN IF NOT EXISTS wakeup_opt_out boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.order_customer_crm.wakeup_opt_out IS
  '關閉自動產喚醒草稿（手動喚醒仍可用）';

CREATE TABLE IF NOT EXISTS public.customer_wakeup_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_key text NOT NULL,
  trigger_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  last_purchase_at timestamptz,
  channel text NOT NULL CHECK (channel IN ('line', 'email')),
  line_user_id text,
  email text,
  draft_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'sent', 'dismissed', 'failed')),
  source text NOT NULL
    CHECK (source IN ('backfill', 'cron_30d', 'admin_compose')),
  admin_notified_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  sent_at timestamptz,
  error_message text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.customer_wakeup_drafts IS
  '訂後關懷喚醒草稿：AI／管理員產文，審核後經 Line 或 Email 發送';

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_wakeup_drafts_one_pending
  ON public.customer_wakeup_drafts (customer_key)
  WHERE status = 'pending_review';

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_wakeup_drafts_sent_trigger
  ON public.customer_wakeup_drafts (trigger_order_id)
  WHERE status = 'sent' AND trigger_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_wakeup_drafts_status_created
  ON public.customer_wakeup_drafts (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_wakeup_drafts_customer_key
  ON public.customer_wakeup_drafts (customer_key);

ALTER TABLE public.customer_wakeup_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage customer_wakeup_drafts" ON public.customer_wakeup_drafts;
CREATE POLICY "Admins can manage customer_wakeup_drafts"
  ON public.customer_wakeup_drafts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_wakeup_drafts TO authenticated;
