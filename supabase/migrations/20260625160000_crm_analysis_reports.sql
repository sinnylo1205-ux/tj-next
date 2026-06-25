-- CRM 整體分析報表快取（一鍵分析所有對話的輸出，避免重複呼叫 OpenAI）

CREATE TABLE IF NOT EXISTS public.crm_analysis_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_days int NOT NULL DEFAULT 90,
  report jsonb NOT NULL,
  generated_by uuid,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_analysis_reports_generated_at
  ON public.crm_analysis_reports(generated_at DESC);

ALTER TABLE public.crm_analysis_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage crm_analysis_reports" ON public.crm_analysis_reports;
CREATE POLICY "Admins can manage crm_analysis_reports"
  ON public.crm_analysis_reports FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
