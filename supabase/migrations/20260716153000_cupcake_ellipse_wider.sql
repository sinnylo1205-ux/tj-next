-- 米紙圓形 (3010)：改為真橢圓寬高比 168×92
UPDATE product_options
SET metadata_product = jsonb_set(
  jsonb_set(metadata_product, '{ui_width}', '168'::jsonb, true),
  '{ui_height}',
  '92'::jsonb,
  true
)
WHERE product_id = 'cupcake_choco'
  AND option_id = 3010;
