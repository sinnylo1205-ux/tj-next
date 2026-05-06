-- 部落格文章：文末「延伸閱讀」連結（JSON 陣列 [{ "href", "label" }]）
alter table public.product_articles
  add column if not exists related_reading jsonb not null default '[]'::jsonb;

comment on column public.product_articles.related_reading is 'Rich-text articles: related reading links after FAQ (href + label).';
