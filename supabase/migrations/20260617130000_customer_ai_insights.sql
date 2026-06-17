-- CRM: AI 洞察資料表

CREATE TABLE IF NOT EXISTS public.customer_ai_insights (
  line_user_id text PRIMARY KEY REFERENCES public.chat_state(line_user_id) ON DELETE CASCADE,
  insights jsonb NOT NULL,
  suggested_tag text,
  recommended_products jsonb,
  suggested_send_window text,
  source_line_log_ids uuid[],
  generated_at timestamptz NOT NULL DEFAULT now(),
  model text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (suggested_tag IS NULL OR suggested_tag IN ('緊急', '待處理', '已下單'))
);

ALTER TABLE public.customer_ai_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read customer_ai_insights" ON public.customer_ai_insights;
CREATE POLICY "Admins can read customer_ai_insights"
  ON public.customer_ai_insights FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can upsert customer_ai_insights" ON public.customer_ai_insights;
CREATE POLICY "Admins can upsert customer_ai_insights"
  ON public.customer_ai_insights FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
