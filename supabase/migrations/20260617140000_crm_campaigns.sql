-- CRM: 活動與發送紀錄（成效歸因基礎）

CREATE TABLE IF NOT EXISTS public.crm_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  segment_filter jsonb,
  message_template text,
  coupon_code text,
  channel text NOT NULL DEFAULT 'line',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_campaign_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.crm_campaigns(id) ON DELETE SET NULL,
  line_user_id text,
  channel text NOT NULL DEFAULT 'line',
  message_text text,
  coupon_code text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by_admin_id uuid,
  metadata jsonb
);

CREATE INDEX IF NOT EXISTS idx_crm_campaign_sends_line_user_id ON public.crm_campaign_sends(line_user_id);
CREATE INDEX IF NOT EXISTS idx_crm_campaign_sends_sent_at ON public.crm_campaign_sends(sent_at);

ALTER TABLE public.crm_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_campaign_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage crm_campaigns" ON public.crm_campaigns;
CREATE POLICY "Admins can manage crm_campaigns"
  ON public.crm_campaigns FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage crm_campaign_sends" ON public.crm_campaign_sends;
CREATE POLICY "Admins can manage crm_campaign_sends"
  ON public.crm_campaign_sends FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
