-- cupcake_choco「米紙圓形」(option_id 3010)：circle → ellipse
-- 平躺橢圓視覺由前端 scaleY 處理
UPDATE product_options
SET metadata_product = jsonb_set(
  metadata_product,
  '{photo_carrier_type}',
  '"ellipse"'::jsonb,
  true
)
WHERE product_id = 'cupcake_choco'
  AND option_id = 3010;

-- 真橢圓比例：寬 > 高（不用 scaleY 壓扁，避免膠囊形轉折）
UPDATE product_options
SET metadata_product = jsonb_set(
  jsonb_set(metadata_product, '{ui_width}', '168'::jsonb, true),
  '{ui_height}',
  '92'::jsonb,
  true
)
WHERE product_id = 'cupcake_choco'
  AND option_id = 3010;
