-- AI 擬真渲染每日使用紀錄（成功才計次；配額以 Asia/Taipei 自然日由 API 計算）

CREATE TABLE IF NOT EXISTS public.ai_render_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  source_image_url text,
  result_image_url text
);

COMMENT ON TABLE public.ai_render_usage IS
  '客製編輯器 AI 擬真渲染使用紀錄；一開始插入即占每日額度（關閉分頁仍計次），result_image_url 完成後回填';

CREATE INDEX IF NOT EXISTS idx_ai_render_usage_user_created
  ON public.ai_render_usage (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_render_usage_user_success_created
  ON public.ai_render_usage (user_id, created_at DESC)
  WHERE result_image_url IS NOT NULL;

ALTER TABLE public.ai_render_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own ai_render_usage" ON public.ai_render_usage;
CREATE POLICY "Users can read own ai_render_usage"
  ON public.ai_render_usage FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- insert/update 僅由 service role（API）執行；不對 authenticated 開放寫入

GRANT SELECT ON public.ai_render_usage TO authenticated;
