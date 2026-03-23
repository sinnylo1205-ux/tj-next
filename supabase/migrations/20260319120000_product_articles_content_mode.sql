-- 文章內容模式：套版 template / 新排版 richtext（Tiptap JSON）
ALTER TABLE public.product_articles
  ADD COLUMN IF NOT EXISTS content_mode TEXT NOT NULL DEFAULT 'template'
    CHECK (content_mode IN ('template', 'richtext'));

ALTER TABLE public.product_articles
  ADD COLUMN IF NOT EXISTS body_json JSONB;

COMMENT ON COLUMN public.product_articles.content_mode IS 'template=套版欄位；richtext=Tiptap body_json';
COMMENT ON COLUMN public.product_articles.body_json IS 'Tiptap JSON 文件（僅 richtext 使用）';
