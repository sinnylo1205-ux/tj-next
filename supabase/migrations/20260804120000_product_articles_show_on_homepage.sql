-- 部落格文章：是否顯示於網站首頁彈窗（預設 false）
ALTER TABLE public.product_articles
  ADD COLUMN IF NOT EXISTS show_on_homepage boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.product_articles.show_on_homepage IS
  'true 時於網站首頁以彈窗輪播顯示文章縮圖（需同時 is_published = true）；預設 false';
