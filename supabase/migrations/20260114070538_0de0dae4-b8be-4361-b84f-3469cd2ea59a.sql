-- 建立產品文章表
CREATE TABLE public.product_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  item_name TEXT NOT NULL,
  intro TEXT NOT NULL,
  why_custom TEXT NOT NULL,
  custom_options JSONB NOT NULL DEFAULT '[]',
  use_cases JSONB NOT NULL DEFAULT '[]',
  faq JSONB NOT NULL DEFAULT '[]',
  editor_path TEXT NOT NULL,
  meta_title TEXT,
  meta_description TEXT,
  og_image_url TEXT,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 建立索引
CREATE INDEX idx_product_articles_slug ON public.product_articles(slug);
CREATE INDEX idx_product_articles_is_published ON public.product_articles(is_published);

-- 啟用 RLS
ALTER TABLE public.product_articles ENABLE ROW LEVEL SECURITY;

-- RLS 政策：公開讀取已發布文章
CREATE POLICY "Anyone can read published articles" 
ON public.product_articles 
FOR SELECT 
USING (is_published = true);

-- 管理員可完全管理文章
CREATE POLICY "Admins can manage all articles"
ON public.product_articles
FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- 更新時間觸發器
CREATE TRIGGER update_product_articles_updated_at
BEFORE UPDATE ON public.product_articles
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();