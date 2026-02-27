-- 為馬卡龍添加缺失的照片載體群組 option_id 3000
INSERT INTO product_options (product_id, option_id, option_name_zh, metadata_product, sort_order_product)
VALUES ('macaron', 3000, '照片載體與載體形狀', '{"notes": "照片載體選項群組"}', 0)
ON CONFLICT DO NOTHING;