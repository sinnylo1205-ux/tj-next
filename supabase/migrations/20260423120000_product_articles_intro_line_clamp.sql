-- 部落格列表卡片：摘要顯示行數（後台可編；null 時前台預設 3）
ALTER TABLE public.product_articles
  ADD COLUMN IF NOT EXISTS intro_line_clamp smallint;

COMMENT ON COLUMN public.product_articles.intro_line_clamp IS
  '甜點部落格列表卡片 intro 摘要行數（1–12；NULL 時前台預設 3）';

ALTER TABLE public.product_articles DROP CONSTRAINT IF EXISTS product_articles_intro_line_clamp_range;
ALTER TABLE public.product_articles ADD CONSTRAINT product_articles_intro_line_clamp_range
  CHECK (intro_line_clamp IS NULL OR (intro_line_clamp >= 1 AND intro_line_clamp <= 12));
