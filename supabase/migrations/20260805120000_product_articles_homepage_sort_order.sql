-- 首頁彈窗案例輪播手動排序（越小越前）
ALTER TABLE public.product_articles
  ADD COLUMN IF NOT EXISTS homepage_sort_order integer;

COMMENT ON COLUMN public.product_articles.homepage_sort_order IS
  '首頁「最新企業合作案例」彈窗輪播順序（越小越前）；僅 show_on_homepage=true 時使用';

-- 既有首頁文章依 updated_at 新→舊回填，維持目前體感順序
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST) AS rn
  FROM public.product_articles
  WHERE show_on_homepage = true
)
UPDATE public.product_articles AS pa
SET homepage_sort_order = ranked.rn
FROM ranked
WHERE pa.id = ranked.id
  AND pa.homepage_sort_order IS NULL;
