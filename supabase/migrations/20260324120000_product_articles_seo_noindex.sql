-- 既有商品文章預設不索引（noindex）；新 insert 預設可索引（false）
ALTER TABLE public.product_articles
  ADD COLUMN IF NOT EXISTS seo_noindex boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.product_articles.seo_noindex IS
  'true 時輸出 meta robots noindex,follow；migration 後一次性將既有列設為 true，新文章預設 false';

UPDATE public.product_articles SET seo_noindex = true;
